/**
 * Turning source text into import edges: extracting specifiers, deciding which files take part, and resolving relative and
 * cross-package (@scope/name) specifiers to candidate files.
 */
import { resolveWorkspacePath } from "@cortex/core";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isFileInWorkspace } from "./workspace.js";

// ---- Extracting every import specifier from source text ----

// `import … from "x"`, `export … from "x"`, side-effect `import "x"`, dynamic `import("x")`
// and `require("x")`. The `[^'"`;]*?` between the keyword and `from` keeps a match inside one
// statement and lets a multi-line import list through.
const MODULE_SPECIFIER = /(?:\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)(['"])([^'"\n]+)\1/g;

/**
 * Lists every module specifier a source file imports — relative (`./a.js`), package
 * (`@cortex/core`) and built-in (`node:fs`) alike — in order of first appearance, without
 * duplicates. Pure; a regex scan rather than a parse, so an import inside a comment or string
 * can show up as a false positive.
 */
export function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];

  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[2];
    if (specifier && !specifiers.includes(specifier)) specifiers.push(specifier);
  }

  return specifiers;
}

// ---- Relative imports only ----

/**
 * Lists the relative module specifiers (`./a.js`, `../b`) a source file imports, in order
 * of first appearance, without duplicates. Package imports (`node:fs`, `@cortex/core`) are
 * left out — they point at dependencies, not at files this file sits next to. Pure; see
 * `extractModuleSpecifiers` for the scan's limits.
 */
export function extractImports(source: string): string[] {
  return extractModuleSpecifiers(source).filter((specifier) => specifier.startsWith("."));
}

// ---- Candidate files for a relative specifier (pure, no IO) ----

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json"];

// TypeScript ESM writes imports with the *output* extension (`./a.js` for `a.ts`).
const OUTPUT_TO_SOURCE_EXTENSION: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

/**
 * Lists, in preference order, the workspace paths a relative import specifier found in
 * `fromFile` could refer to: the `.js`-for-`.ts` convention, extensionless imports, and
 * directory `index` files. Pure — the caller decides how to check which one exists (a
 * `stat` for one-off lookups, a set lookup when it already has the whole file list).
 * A candidate may start with `..` when the specifier climbs out of the workspace.
 */
export function listImportCandidates(fromFile: string, specifier: string): string[] {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const extension = path.posix.extname(base);
  const sourceExtensions = OUTPUT_TO_SOURCE_EXTENSION[extension];

  if (sourceExtensions) {
    const stem = base.slice(0, -extension.length);
    return [...sourceExtensions.map((ext) => stem + ext), base];
  }

  return [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
}

// ---- Resolving a relative import on disk ----

/**
 * Maps a relative import specifier found in `fromFile` to the workspace file it refers to,
 * as a `/`-separated workspace-relative path, or `undefined` when it doesn't point at an
 * existing file inside the workspace. Handles extensionless imports, directory `index`
 * files, and the `.js`-for-`.ts` convention.
 */
export async function resolveImportPath(
  workspaceRoot: string,
  fromFile: string,
  specifier: string,
): Promise<string | undefined> {
  for (const candidate of listImportCandidates(fromFile, specifier)) {
    if (await isFileInWorkspace(workspaceRoot, candidate)) return candidate;
  }
  return undefined;
}

// ---- Which files take part in the graph ----

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** True for the JavaScript/TypeScript files whose imports the dependency graph tracks. */
export function isSourceFile(relativePath: string): boolean {
  return SOURCE_FILE.test(relativePath);
}

// ---- Which files get indexed ----

/** True for the files the import index tracks: JS/TS source, plus `package.json` (it names the workspace packages other files import). */
export function isIndexedFile(relativePath: string): boolean {
  return isSourceFile(relativePath) || path.posix.basename(relativePath) === "package.json";
}

// ---- Cross-package specifiers ----

/**
 * The package a bare module specifier belongs to: `@cortex/core/sub/path` is in
 * `@cortex/core`, `lodash/fp` is in `lodash`. Returns `undefined` for relative specifiers
 * and `node:` built-ins, which don't name a package.
 */
export function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return undefined;

  const segments = specifier.split("/");
  if (specifier.startsWith("@")) return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined;
  return segments[0];
}

// ---- Reading a package manifest ----

export interface PackageManifest {
  name: string;
  /** `main`, else `module`, else `types`; relative to the package directory. */
  main?: string;
}

/** The name and entry point from a workspace `package.json`; `undefined` when it's unreadable, malformed or unnamed. */
export async function readPackageManifest(
  workspaceRoot: string,
  relativePath: string,
): Promise<PackageManifest | undefined> {
  try {
    const raw = await fs.readFile(resolveWorkspacePath(workspaceRoot, relativePath), "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown; main?: unknown; module?: unknown; types?: unknown };
    if (typeof parsed.name !== "string" || parsed.name === "") return undefined;

    const main = [parsed.main, parsed.module, parsed.types].find((value): value is string => typeof value === "string");
    return { name: parsed.name, main };
  } catch {
    return undefined;
  }
}

// ---- Mapping a package specifier to candidate entry files ----

/** A workspace package, found by its `package.json`. */
export interface WorkspacePackage {
  /** Workspace-relative path of the package's `package.json`. */
  manifest: string;
  /** Entry point relative to the package directory (`src/index.ts`), when it declares one. */
  main?: string;
}

/**
 * Lists, in preference order, the workspace files a bare specifier such as `@cortex/core`
 * or `@cortex/core/sub` could refer to, given the workspace's packages by name: the
 * package's entry point for the bare name, or the file under the package directory for a
 * subpath. Empty when the specifier isn't one of the workspace's own packages (a third-party
 * dependency or a built-in). Pure — the caller checks which candidate exists.
 */
export function listPackageImportCandidates(
  specifier: string,
  packages: ReadonlyMap<string, WorkspacePackage>,
): string[] {
  const name = packageNameOf(specifier);
  const workspacePackage = name === undefined ? undefined : packages.get(name);
  if (!name || !workspacePackage) return [];

  const subpath = specifier.slice(name.length).replace(/^\//, "");
  if (subpath) return listImportCandidates(workspacePackage.manifest, `./${subpath}`);
  return workspacePackage.main ? listImportCandidates(workspacePackage.manifest, `./${workspacePackage.main}`) : [];
}

// ---- Reading one file's specifiers ----

/** Every module specifier a workspace source file imports (relative, package and built-in); `[]` when it can't be read. */
export async function readFileSpecifiers(workspaceRoot: string, relativePath: string): Promise<string[]> {
  try {
    const source = await fs.readFile(resolveWorkspacePath(workspaceRoot, relativePath), "utf-8");
    return extractModuleSpecifiers(source);
  } catch {
    return [];
  }
}
