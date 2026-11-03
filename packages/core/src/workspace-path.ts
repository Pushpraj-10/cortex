/**
 * The workspace sandbox. Every tool that touches the filesystem resolves its paths through
 * `resolveWorkspacePath`, so the boundary is enforced in one place instead of being reimplemented
 * (and drifting) in each tool.
 *
 * Three checks, in order: the path is written as a plain relative path (no absolute form, no leading
 * slash, no component Windows treats specially); it stays inside the root as written; and it stays
 * inside the root where it really lives, after symbolic links and junctions are followed. The last one
 * matters because a repository can contain a link to anywhere (`notes.txt -> ~/.ssh/id_rsa`), and a
 * path that only looks inside the workspace would read or overwrite the target.
 *
 * Residual risk: a link swapped in between this check and the file operation that follows is not
 * caught (Node has no portable way to open "relative to a directory handle, never following links").
 */
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { CortexError } from "./result.js";

export class WorkspaceBoundaryError extends CortexError {
  constructor(requestedPath: string, throughLink = false) {
    super(
      throughLink
        ? `Path "${requestedPath}" leads outside the workspace through a symbolic link or junction (or its real location cannot be ` +
            `checked) — links are never followed out of the workspace. Use a path whose real location is inside the workspace root`
        : `Path "${requestedPath}" escapes the workspace root — paths must be relative ` +
            `to the workspace root (e.g. "folder/example.ext"), never absolute and never ` +
            `starting with "/"`,
      "WORKSPACE_PATH_ESCAPE",
    );
  }
}

/** A path with a component that Windows treats specially (a device name, a stream, a stripped trailing dot), refused on every platform so a workspace behaves the same everywhere. */
export class UnsafePathError extends CortexError {
  constructor(requestedPath: string, component: string, reason: string) {
    super(
      `Path "${requestedPath}" has a component ("${component}") that is not allowed: ${reason}. Rename it or choose another path.`,
      "WORKSPACE_PATH_UNSAFE",
    );
  }
}

// ---- Portable names --------------------------------------------------------------

/** Windows device names, alone or with any extension (`nul.txt` is still the NUL device). The superscript digits count too. */
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;

/** Why a path component cannot be used, or undefined when it can. `.` and `..` are not names and are left to the containment checks. */
function unsafeReason(component: string): string | undefined {
  if (component === "" || component === "." || component === "..") return undefined;
  if (component.includes(":")) return "':' is Windows drive or alternate-data-stream syntax";
  if (component.endsWith(".") || component.endsWith(" ")) return "Windows strips trailing dots and spaces, so it names a different file";
  if (WINDOWS_DEVICE_NAME.test(component)) return "it is a reserved Windows device name";
  return undefined;
}

// ---- Real locations --------------------------------------------------------------

const isLink = (target: string): boolean => {
  try {
    return lstatSync(target).isSymbolicLink(); // junctions count as links here
  } catch {
    return false;
  }
};

/**
 * Where `target` really is, with every link along the way followed. The part that does not exist yet (a file about to be
 * created) is kept as written, since nothing there can be a link. Returns undefined when that cannot be established with
 * confidence: a link pointing at nothing (writing through it would create the file at its target), a loop, or no permission.
 */
function realLocation(target: string): string | undefined {
  const missing: string[] = [];
  let probe = target;
  for (;;) {
    try {
      return path.join(realpathSync.native(probe), ...missing);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") return undefined;
    }
    if (isLink(probe)) return undefined;
    const parent = path.dirname(probe);
    if (parent === probe) return probe;
    missing.unshift(path.basename(probe));
    probe = parent;
  }
}

/** Whether `candidate` is `root` or somewhere under it. Component-aware, and case-insensitive where the platform is. */
function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// ---- The check -------------------------------------------------------------------

/**
 * Resolves `relativePath` against `root` and throws WorkspaceBoundaryError for any result that
 * escapes it, whether by `..`, an absolute path, a sibling directory that merely shares the
 * root's name as a prefix, or a symbolic link / junction that leads out. Throws UnsafePathError for a
 * component Windows treats specially. The returned path is the one asked for (inside `root`), not the
 * link-resolved one.
 */
export function resolveWorkspacePath(root: string, relativePath: string): string {
  // Absolute paths are rejected even when they happen to point inside the root.
  // Allowing "inside" ones made the contract inconsistent: the same mistake
  // produced a boundary error, an ENOENT, or a silent success depending on the
  // exact spelling, which gave a model no repeatable signal to correct against.
  if (path.isAbsolute(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new WorkspaceBoundaryError(relativePath);
  }
  for (const component of relativePath.split(/[\\/]/)) {
    const reason = unsafeReason(component);
    if (reason) throw new UnsafePathError(relativePath, component, reason);
  }

  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new WorkspaceBoundaryError(relativePath);
  }

  // Where both really are. A root that does not exist (as in tests) resolves the same way its candidates do.
  const realRoot = realLocation(resolvedRoot);
  const realTarget = realLocation(resolved);
  if (realRoot === undefined || realTarget === undefined || !isInside(realRoot, realTarget)) {
    throw new WorkspaceBoundaryError(relativePath, true);
  }
  return resolved;
}
