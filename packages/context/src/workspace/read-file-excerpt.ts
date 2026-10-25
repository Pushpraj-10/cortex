import { promises as fs } from "node:fs";
import { ok, err, resolveWorkspacePath, type Result } from "@cortex/core";
import { WorkspaceReadError } from "./errors.js";

const DEFAULT_MAX_CHARS = 4000;
const TRUNCATION_NOTE = "\n… [file truncated]";

/**
 * Reads up to `maxChars` characters of a text file. Binary files (anything containing a
 * NUL byte) and unreadable or out-of-workspace paths come back as an error Result, so a
 * caller can skip them without a try/catch.
 */
export async function readFileExcerpt(
  workspaceRoot: string,
  relativePath: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): Promise<Result<string>> {
  let raw: string;
  try {
    raw = await fs.readFile(resolveWorkspacePath(workspaceRoot, relativePath), "utf-8");
  } catch (error) {
    return err(new WorkspaceReadError(`Failed to read ${relativePath}`, error));
  }

  if (raw.includes("\u0000")) return err(new WorkspaceReadError(`${relativePath} looks like a binary file`));

  return ok(raw.length > maxChars ? raw.slice(0, maxChars) + TRUNCATION_NOTE : raw);
}
