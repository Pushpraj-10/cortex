import { promises as fs } from "node:fs";
import { resolveWorkspacePath } from "@cortex/shared";
import { extractModuleSpecifiers } from "../workspace/extract-module-specifiers.js";

/** Every module specifier a workspace source file imports (relative, package and built-in); `[]` when it can't be read. */
export async function readFileSpecifiers(workspaceRoot: string, relativePath: string): Promise<string[]> {
  try {
    const source = await fs.readFile(resolveWorkspacePath(workspaceRoot, relativePath), "utf-8");
    return extractModuleSpecifiers(source);
  } catch {
    return [];
  }
}
