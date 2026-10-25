/**
 * Filesystem helpers confined to the workspace: walking it, reading excerpts, finding file names in a user message and resolving
 * them to real files, and locating a file's tests. Nothing here can read outside the workspace root.
 */
import { CortexError, resolveWorkspacePath, ok, err, type Result } from "@cortex/core";
import { promises as fs } from "node:fs";
import path from "node:path";

// ---- Errors ----

export class WorkspaceReadError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONTEXT_WORKSPACE_READ_ERROR", cause);
  }
}

// ---- Directories every walk skips ----

/** Directory/file names never worth showing the model or walking into. */
export const IGNORED_NAMES: ReadonlySet<string> = new Set(["node_modules", ".git", "dist"]);

// ---- Walking the workspace ----

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ENTRIES = 5000;

export interface WalkWorkspaceOptions {
  /** Directories deeper than this (the root is depth 0) are not entered. Defaults to 6. */
  maxDepth?: number;
  /** Stop collecting after this many files. Defaults to 5000. */
  maxEntries?: number;
}

/**
 * Lists the files under `workspaceRoot` as `/`-separated paths relative to it, breadth
 * first so shallow files are never crowded out by a deep tree when the entry cap hits.
 * Ignored directories (node_modules, .git, dist) are skipped, symlinks are not followed,
 * and a directory that can't be read is skipped rather than failing the walk.
 */
export async function walkWorkspace(workspaceRoot: string, options: WalkWorkspaceOptions = {}): Promise<string[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const files: string[] = [];
  let level: string[] = [""];

  for (let depth = 0; depth <= maxDepth && level.length > 0; depth += 1) {
    const nextLevel: string[] = [];

    for (const directory of level) {
      let entries;
      try {
        entries = await fs.readdir(resolveWorkspacePath(workspaceRoot, directory || "."), { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (IGNORED_NAMES.has(entry.name)) continue;
        const relativePath = directory ? path.posix.join(directory, entry.name) : entry.name;

        if (entry.isDirectory()) {
          nextLevel.push(relativePath);
        } else if (entry.isFile()) {
          files.push(relativePath);
          if (files.length >= maxEntries) return files;
        }
      }
    }

    level = nextLevel;
  }

  return files;
}

// ---- Existence checks that cannot escape the workspace ----

/** True when `relativePath` is an existing regular file inside the workspace; false for anything else, including paths that escape it. */
export async function isFileInWorkspace(workspaceRoot: string, relativePath: string): Promise<boolean> {
  try {
    return (await fs.stat(resolveWorkspacePath(workspaceRoot, relativePath))).isFile();
  } catch {
    return false;
  }
}

// ---- Reading file excerpts ----

const DEFAULT_MAX_CHARS = 4000;
const TRUNCATION_NOTE = "\n… [file truncated]";

/**
 * Reads up to `maxChars` characters of a text file. Binary files (anything containing a
 * NUL byte) and unreadable or out-of-workspace paths come back as an error Result, so a
 * caller can skip them without a try/catch.
 */
export async function readFileExcerpt(
  workspaceRoot: string,
  relativePath: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<Result<string>> {
  let raw: string;
  try {
    raw = await fs.readFile(resolveWorkspacePath(workspaceRoot, relativePath), "utf-8");
  } catch (error) {
    return err(new WorkspaceReadError(`Failed to read ${relativePath}`, error));
  }

  if (raw.includes("\u0000")) return err(new WorkspaceReadError(`${relativePath} looks like a binary file`));

  return ok(raw.length > maxChars ? raw.slice(0, maxChars) + TRUNCATION_NOTE : raw);
}

// ---- Finding file names in a user message ----

const MAX_MENTIONS = 10;

/**
 * Extensions recognised as "this word names a file". An allowlist rather than "anything
 * with a dot", so prose like "e.g.", "v1.2" or "example.com" is never mistaken for a path.
 */
const FILE_EXTENSIONS = [
  "tsx", "ts", "mjs", "cjs", "jsx", "json", "js",
  "md", "mdx", "txt", "yaml", "yml", "toml", "env",
  "css", "scss", "html", "sql", "sh",
  "py", "go", "rs", "java", "kt", "rb", "php", "cs", "cpp", "c", "hpp", "h", "swift",
];

// A path is `/`- or `\`-separated segments ending in `name.ext`. The lookbehind stops a match
// from starting mid-word or mid-path (so URLs and absolute paths produce nothing); the
// lookahead stops `a.ts` matching inside `a.tsx`.
const FILE_MENTION = new RegExp(
  String.raw`(?<![\w@./\\:-])((?:[\w@.-]+[\\/])*[\w@-][\w@.-]*\.(?:${FILE_EXTENSIONS.join("|")}))(?![\w-])`,
  "g",
);

/**
 * Pulls file-looking references out of free text — `src/index.ts`, `` `package.json` ``,
 * "tool-loop.ts" — as workspace-relative, `/`-separated paths, in order of first
 * appearance, without duplicates. Pure: says nothing about whether the files exist.
 */
export function extractFileMentions(text: string): string[] {
  const mentions: string[] = [];

  for (const match of text.matchAll(FILE_MENTION)) {
    const mention = (match[1] ?? "").replace(/\\/g, "/").replace(/^(\.\/)+/, "");
    if (mention && !mentions.includes(mention)) mentions.push(mention);
    if (mentions.length >= MAX_MENTIONS) break;
  }

  return mentions;
}

// ---- Resolving mentions to real files ----

const DEFAULT_MAX_FILES = 3;

export interface ResolveMentionedFilesOptions {
  /** At most this many files are returned. Defaults to 3. */
  maxFiles?: number;
}

/**
 * Maps file mentions to files that actually exist, as `/`-separated workspace-relative
 * paths. A mention is tried as an exact path first (so `package.json` means the root one);
 * failing that it must match exactly one file in the workspace by trailing path
 * (`tool-loop.ts`, `core/tool-loop.ts`). Missing, ambiguous or out-of-workspace mentions
 * are skipped — a wrong guess would attach the wrong file, which is worse than none.
 */
export async function resolveMentionedFiles(
  workspaceRoot: string,
  mentions: string[],
  options: ResolveMentionedFilesOptions = {},
): Promise<string[]> {
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const resolved: string[] = [];
  let walked: string[] | undefined;

  for (const mention of mentions) {
    if (resolved.length >= maxFiles) break;

    let match = (await isFileInWorkspace(workspaceRoot, mention)) ? mention : undefined;

    if (!match) {
      walked ??= await walkWorkspace(workspaceRoot);
      const candidates = walked.filter((file) => file === mention || file.endsWith(`/${mention}`));
      if (candidates.length === 1) match = candidates[0];
    }

    if (match && !resolved.includes(match)) resolved.push(match);
  }

  return resolved;
}

// ---- Finding the tests that belong to a file ----

const TEST_FILE = /\.(test|spec)\.[^./]+$/;
const TEST_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const TEST_DIRECTORY_NAMES = ["test", "tests"];

/**
 * Finds the test files that sit next to a source file by convention, as `/`-separated
 * workspace-relative paths: `a.test.ts`/`a.spec.ts` beside it, in a sibling `__tests__/`,
 * or in a `test/` (or `tests/`) tree that mirrors `src/` — this repo's layout, where
 * `packages/p/src/a/b.ts` is tested by `packages/p/test/a/b.test.ts`. Returns `[]` for a
 * file that is itself a test, or has no tests by those conventions.
 */
export async function findRelatedTests(workspaceRoot: string, sourceFile: string): Promise<string[]> {
  if (TEST_FILE.test(sourceFile)) return [];

  const found: string[] = [];
  for (const candidate of candidatesFor(sourceFile)) {
    if (!found.includes(candidate) && (await isFileInWorkspace(workspaceRoot, candidate))) found.push(candidate);
  }
  return found;
}

function candidatesFor(sourceFile: string): string[] {
  const directory = path.posix.dirname(sourceFile);
  const name = path.posix.basename(sourceFile, path.posix.extname(sourceFile));
  const testNames = ["test", "spec"].flatMap((kind) => TEST_EXTENSIONS.map((ext) => `${name}.${kind}${ext}`));
  const inDirectory = (dir: string) => testNames.map((testName) => path.posix.join(dir, testName));

  const candidates = [...inDirectory(directory), ...inDirectory(path.posix.join(directory, "__tests__"))];

  const segments = sourceFile.split("/");
  const srcIndex = segments.indexOf("src");
  if (srcIndex !== -1) {
    const packageRoot = segments.slice(0, srcIndex);
    const insideSrc = segments.slice(srcIndex + 1, -1);
    for (const testDirectory of TEST_DIRECTORY_NAMES) {
      candidates.push(...inDirectory(path.posix.join(...packageRoot, testDirectory, ...insideSrc)));
    }
  }

  return candidates;
}

// ---- A request's mentions, resolved once ----

const requestMentions = new WeakMap<object, Promise<string[]>>();

/**
 * The workspace files a request's message names. Several providers need exactly this on the
 * same request, so it is resolved once per request object instead of walking the workspace
 * again for each of them.
 */
export function resolveRequestMentions(request: { workspaceRoot: string; userMessage: string }): Promise<string[]> {
  let pending = requestMentions.get(request);
  if (!pending) {
    pending = resolveMentionedFiles(request.workspaceRoot, extractFileMentions(request.userMessage));
    requestMentions.set(request, pending);
  }
  return pending;
}
