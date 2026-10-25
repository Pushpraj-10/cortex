/**
 * The workspace sandbox. Every tool that touches the filesystem resolves its paths through
 * `resolveWorkspacePath`, so the boundary is enforced in one place instead of being reimplemented
 * (and drifting) in each tool.
 */
import path from "node:path";
import { CortexError } from "./result.js";

export class WorkspaceBoundaryError extends CortexError {
  constructor(requestedPath: string) {
    super(
      `Path "${requestedPath}" escapes the workspace root — paths must be relative ` +
        `to the workspace root (e.g. "folder/example.ext"), never absolute and never ` +
        `starting with "/"`,
      "WORKSPACE_PATH_ESCAPE",
    );
  }
}

/**
 * Resolves `relativePath` against `root` and throws WorkspaceBoundaryError for any result that
 * escapes it, whether by `..`, an absolute path, or a sibling directory that merely shares the
 * root's name as a prefix.
 */
export function resolveWorkspacePath(root: string, relativePath: string): string {
  // Absolute paths are rejected even when they happen to point inside the root.
  // Allowing "inside" ones made the contract inconsistent: the same mistake
  // produced a boundary error, an ENOENT, or a silent success depending on the
  // exact spelling, which gave a model no repeatable signal to correct against.
  if (path.isAbsolute(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new WorkspaceBoundaryError(relativePath);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new WorkspaceBoundaryError(relativePath);
  }
  return resolved;
}
