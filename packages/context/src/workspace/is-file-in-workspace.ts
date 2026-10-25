import { promises as fs } from "node:fs";
import { resolveWorkspacePath } from "@cortex/shared";

/** True when `relativePath` is an existing regular file inside the workspace; false for anything else, including paths that escape it. */
export async function isFileInWorkspace(workspaceRoot: string, relativePath: string): Promise<boolean> {
  try {
    return (await fs.stat(resolveWorkspacePath(workspaceRoot, relativePath))).isFile();
  } catch {
    return false;
  }
}
