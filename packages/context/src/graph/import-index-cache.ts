import path from "node:path";
import type { ImportIndex } from "./types.js";

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
