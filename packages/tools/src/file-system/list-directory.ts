import { promises as fs } from "node:fs";
import path from "node:path";
import { ok, err, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface ListDirectoryArgs {
  path: string;
}

interface ListDirectoryResult {
  entries: { name: string; type: "file" | "directory" }[];
}

async function listDirectoryHandler(
  args: ListDirectoryArgs,
  context: ToolExecutionContext,
): Promise<Result<ListDirectoryResult>> {
  try {
    const entries = await fs.readdir(args.path, { withFileTypes: true });
    return ok({
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
      })),
    });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to list directory at ${args.path}: ${error}`));
  }
}

export const listDirectoryTool: ToolDefinition<ListDirectoryArgs, ListDirectoryResult> = {
  name: "list_directory",
  description: "List files and subdirectories in a directory",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the directory (relative to workspace root)" },
    },
    required: ["path"],
  },
  handler: listDirectoryHandler,
};
