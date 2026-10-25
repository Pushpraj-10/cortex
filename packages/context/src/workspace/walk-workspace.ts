import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "@cortex/core";
import { IGNORED_NAMES } from "./ignored-names.js";

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
