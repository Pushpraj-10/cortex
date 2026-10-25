import { buildImportGraph } from "./build-import-graph.js";
import { getCachedImportIndex, setCachedImportIndex } from "./import-index-cache.js";
import { updateImportIndex } from "./update-import-index.js";
import type { ImportGraph } from "./types.js";

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
