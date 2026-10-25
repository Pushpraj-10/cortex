import type { Dependent, ImportGraph } from "./types.js";

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
