/**
 * The import graph behind the dependents provider: an incrementally-updated index of who imports whom (re-parsing only files whose
 * mtime or size changed), forward and reverse edges built from it, and a bounded reverse-dependency search.
 */
import { resolveWorkspacePath } from "@cortex/core";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isIndexedFile, readFileSpecifiers, readPackageManifest, listImportCandidates, listPackageImportCandidates, type WorkspacePackage } from "./imports.js";
import { walkWorkspace } from "./workspace.js";

// ---- Graph types ----

/**
 * What is remembered about one indexed file between turns. Only *raw* facts are stored, never
 * the files they resolve to: resolution depends on which other files exist right now, so it
 * is redone against the current file set each time the graph is built, and a file created or
 * deleted elsewhere can never leave a stale edge behind.
 */
export interface IndexedFile {
  mtimeMs: number;
  size: number;
  /** For a source file: every module specifier it imports (`./a.js`, `@cortex/core`, `node:fs`). Empty for a `package.json`. */
  specifiers: string[];
  /** For a `package.json`: its `name`, which makes the package importable by that name from elsewhere in the workspace. */
  packageName?: string;
  /** For a `package.json`: its entry point (`main`, else `module`, else `types`), relative to the package directory. */
  packageMain?: string;
}

/** Workspace-relative, `/`-separated path → what's known about that source file or `package.json`. */
export type ImportIndex = Map<string, IndexedFile>;

/** Import edges between workspace files, in both directions. */
export interface ImportGraph {
  /** file → the workspace files it imports. */
  forward: Map<string, string[]>;
  /** file → the workspace files that import it. */
  reverse: Map<string, string[]>;
}

/** A file affected by a change to another, and how many import hops away it is (1 = imports it directly). */
export interface Dependent {
  file: string;
  depth: number;
}

// ---- Bounded-concurrency helper ----

/**
 * Maps `items` through an async `fn`, at most `batchSize` at a time, returning results in
 * input order. Bounds how many files are open at once so indexing a big workspace can't
 * exhaust file handles, and checks `signal` between batches so a cancelled turn stops promptly.
 */
export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = [];

  for (let start = 0; start < items.length; start += batchSize) {
    signal?.throwIfAborted();
    results.push(...(await Promise.all(items.slice(start, start + batchSize).map(fn))));
  }

  return results;
}

// ---- Per-process index cache ----

/**
 * Workspace root → its last-built import index, kept for the life of the process so a
 * session only re-parses what changed between turns. Like the provider registry, it is
 * module-level state; unlike it, it can be cleared, so tests (and anything that wants a
 * guaranteed fresh scan) can reset it.
 */
const cache = new Map<string, ImportIndex>();

export function getCachedImportIndex(workspaceRoot: string): ImportIndex | undefined {
  return cache.get(path.resolve(workspaceRoot));
}

export function setCachedImportIndex(workspaceRoot: string, index: ImportIndex): void {
  cache.set(path.resolve(workspaceRoot), index);
}

/** Forgets one workspace's cached index, or every workspace's when called with no argument. */
export function clearImportIndexCache(workspaceRoot?: string): void {
  if (workspaceRoot === undefined) cache.clear();
  else cache.delete(path.resolve(workspaceRoot));
}

// ---- Incremental index update ----

const MAX_DEPTH = 8;
const MAX_FILES = 20_000;
const BATCH_SIZE = 32;
/** Generated bundles and data dumps aren't worth parsing; they stay in the index with no imports. */
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;

export interface UpdateImportIndexOptions {
  /** Files larger than this are indexed with no imports instead of being read. Defaults to 256 KiB. */
  maxFileBytes?: number;
  signal?: AbortSignal;
}

/**
 * Brings an import index up to date with the workspace and returns the new one. Every source
 * file and `package.json` is `stat`ed (cheap), but only files that are new or whose mtime/size
 * changed are read and parsed (the expensive part); unchanged records are carried over as-is
 * and files that no longer exist drop out. So the first call on a workspace pays for a full
 * scan, and each later call costs roughly one `stat` per file plus a re-parse of whatever was
 * edited since.
 */
export async function updateImportIndex(
  workspaceRoot: string,
  previous?: ImportIndex,
  options: UpdateImportIndexOptions = {},
): Promise<ImportIndex> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;

  const walked = await walkWorkspace(workspaceRoot, { maxDepth: MAX_DEPTH, maxEntries: MAX_FILES });
  const sourceFiles = walked.filter(isIndexedFile);

  const stats = await mapInBatches(
    sourceFiles,
    BATCH_SIZE,
    async (file) => {
      try {
        const { mtimeMs, size } = await fs.stat(resolveWorkspacePath(workspaceRoot, file));
        return { file, mtimeMs, size };
      } catch {
        return undefined; // vanished between the walk and the stat
      }
    },
    options.signal,
  );

  const next: ImportIndex = new Map();
  const changed: { file: string; mtimeMs: number; size: number }[] = [];

  for (const stat of stats) {
    if (!stat) continue;
    const known = previous?.get(stat.file);
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) {
      next.set(stat.file, known);
    } else {
      changed.push(stat);
    }
  }

  const parsed = await mapInBatches(
    changed,
    BATCH_SIZE,
    async (stat): Promise<[string, IndexedFile]> => {
      const record: IndexedFile = { mtimeMs: stat.mtimeMs, size: stat.size, specifiers: [] };
      if (stat.size > maxFileBytes) return [stat.file, record];

      if (path.posix.basename(stat.file) === "package.json") {
        const manifest = await readPackageManifest(workspaceRoot, stat.file);
        if (manifest) {
          record.packageName = manifest.name;
          record.packageMain = manifest.main;
        }
      } else {
        record.specifiers = await readFileSpecifiers(workspaceRoot, stat.file);
      }
      return [stat.file, record];
    },
    options.signal,
  );

  for (const [file, record] of parsed) next.set(file, record);

  return next;
}

// ---- Building forward and reverse edges ----

/**
 * Resolves every indexed file's import specifiers against the files in the index and
 * returns the edges in both directions. Relative imports resolve by path; bare imports
 * (`@cortex/core`) resolve only if they name one of the workspace's own packages, found via
 * its `package.json`, and land on that package's entry point — which is what lets a change
 * ripple across package boundaries. Resolution is a set lookup per candidate — no IO — so
 * it stays cheap enough to redo on every turn. Imports that don't land on an indexed file
 * (third-party packages, built-ins, missing files) and self-imports are dropped.
 */
export function buildImportGraph(index: ImportIndex): ImportGraph {
  const packages = new Map<string, WorkspacePackage>();
  for (const [file, record] of index) {
    if (record.packageName) packages.set(record.packageName, { manifest: file, main: record.packageMain });
  }

  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  for (const [file, record] of index) {
    const targets: string[] = [];

    for (const specifier of record.specifiers) {
      const candidates = specifier.startsWith(".")
        ? listImportCandidates(file, specifier)
        : listPackageImportCandidates(specifier, packages);
      const target = candidates.find((candidate) => index.has(candidate));
      if (target && target !== file && !targets.includes(target)) targets.push(target);
    }

    forward.set(file, targets);
    for (const target of targets) {
      const importers = reverse.get(target);
      if (importers) importers.push(file);
      else reverse.set(target, [file]);
    }
  }

  return { forward, reverse };
}

// ---- Entry point: the cached, freshly updated graph ----

/**
 * The workspace's current import graph. The first call scans every source file; later calls
 * re-parse only files edited since (including by the agent's own tools), so asking every
 * turn stays cheap. If `signal` aborts mid-scan the half-built index is discarded and the
 * abort propagates, leaving the cache as it was.
 */
export async function getImportGraph(workspaceRoot: string, signal?: AbortSignal): Promise<ImportGraph> {
  const index = await updateImportIndex(workspaceRoot, getCachedImportIndex(workspaceRoot), { signal });
  setCachedImportIndex(workspaceRoot, index);
  return buildImportGraph(index);
}

// ---- Reverse-dependency search ----

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_RESULTS = 30;

export interface FindDependentsOptions {
  /** How many import hops to follow outward from the file. Defaults to 3. */
  maxDepth?: number;
  /** Stop after this many dependents. Defaults to 30. */
  maxResults?: number;
}

/**
 * The files that would feel a change to `file`: those that import it directly (depth 1),
 * those that import *them* (depth 2), and so on. Breadth first, so nearer dependents always
 * come before farther ones and the caps cut off the least relevant ones; paths are sorted
 * within a depth for stable output. Import cycles are safe — each file is reported once.
 */
export function findDependents(graph: ImportGraph, file: string, options: FindDependentsOptions = {}): Dependent[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

  const visited = new Set([file]);
  const dependents: Dependent[] = [];
  let frontier = [file];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const found = new Set<string>();
    for (const current of frontier) {
      for (const importer of graph.reverse.get(current) ?? []) {
        if (!visited.has(importer)) found.add(importer);
      }
    }

    const level = [...found].sort();
    for (const importer of level) {
      visited.add(importer);
      dependents.push({ file: importer, depth });
      if (dependents.length >= maxResults) return dependents;
    }
    frontier = level;
  }

  return dependents;
}
