import { walkWorkspace } from "@cortex/context";

/** Deeper than the context walker's default, so `packages/x/src/a/b/c.ts` and the like are offered. */
const MAX_DEPTH = 8;
const MAX_FILES = 5000;

/**
 * The files the `@` menu can offer: everything under `cwd` as `/`-separated paths relative to it, shallowest first, with
 * `node_modules`, `.git` and `dist` left out (the walker `@cortex/context` uses to resolve file mentions). It lives here,
 * not in `ui/`, because it reads the file system; `index.ts` hands it to the UI.
 */
export function listWorkspaceFiles(cwd: string): Promise<string[]> {
  return walkWorkspace(cwd, { maxDepth: MAX_DEPTH, maxEntries: MAX_FILES });
}
