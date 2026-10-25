/**
 * The current git branch, for the footer, read straight from `.git/HEAD` rather than by running git: it costs one small
 * file read, works with no git installed, and cannot hang. It finds the repository by walking up from the folder, follows
 * a `.git` *file* (a worktree or submodule points at its real git directory with `gitdir: <path>`), and shows a short
 * commit hash when HEAD is detached. Anything unexpected is "no branch", never an error.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The git directory for a working folder, or undefined if it has none. */
function gitDirectoryOf(folder: string): string | undefined {
  const dotGit = path.join(folder, ".git");
  try {
    const stat = statSync(dotGit);
    if (stat.isDirectory()) return dotGit;
    const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf-8"));
    return pointer ? path.resolve(folder, pointer[1]!.trim()) : undefined;
  } catch {
    return undefined;
  }
}

/** The branch checked out in `cwd`'s repository, a 7-character hash if HEAD is detached, or undefined outside a repository. */
export function readGitBranch(cwd: string): string | undefined {
  let folder = path.resolve(cwd);
  for (;;) {
    const gitDirectory = gitDirectoryOf(folder);
    if (gitDirectory) {
      try {
        const head = readFileSync(path.join(gitDirectory, "HEAD"), "utf-8").trim();
        const branch = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
        if (branch) return branch[1];
        return /^[0-9a-f]{40}$/i.test(head) ? head.slice(0, 7) : undefined;
      } catch {
        return undefined;
      }
    }
    const parent = path.dirname(folder);
    if (parent === folder) return undefined;
    folder = parent;
  }
}
