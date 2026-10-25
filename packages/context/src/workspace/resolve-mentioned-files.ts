import { walkWorkspace } from "./walk-workspace.js";
import { isFileInWorkspace } from "./is-file-in-workspace.js";

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
