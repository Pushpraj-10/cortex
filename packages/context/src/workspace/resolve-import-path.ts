import { isFileInWorkspace } from "./is-file-in-workspace.js";
import { listImportCandidates } from "./list-import-candidates.js";

/**
 * Maps a relative import specifier found in `fromFile` to the workspace file it refers to,
 * as a `/`-separated workspace-relative path, or `undefined` when it doesn't point at an
 * existing file inside the workspace. Handles extensionless imports, directory `index`
 * files, and the `.js`-for-`.ts` convention.
 */
export async function resolveImportPath(
  workspaceRoot: string,
  fromFile: string,
  specifier: string,
): Promise<string | undefined> {
  for (const candidate of listImportCandidates(fromFile, specifier)) {
    if (await isFileInWorkspace(workspaceRoot, candidate)) return candidate;
  }
  return undefined;
}
