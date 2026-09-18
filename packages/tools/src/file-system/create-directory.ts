import { promises as fs } from "node:fs";
import { ok, err, resolveWorkspacePath, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface CreateDirectoryArgs {
  path: string;
}

interface CreateDirectoryResult {
  success: boolean;
}

async function createDirectoryHandler(
  args: CreateDirectoryArgs,
  context: ToolExecutionContext,
): Promise<Result<CreateDirectoryResult>> {
  try {
    const resolvedPath = resolveWorkspacePath(context.cwd, args.path);
    await fs.mkdir(resolvedPath, { recursive: true });
    return ok({ success: true });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to create directory at ${args.path}: ${error}`));
  }
}

export const createDirectoryTool: ToolDefinition<CreateDirectoryArgs, CreateDirectoryResult> = {
  name: "create_directory",
  description: "Create a directory (including parent directories if needed)",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the directory (relative to workspace root)" },
    },
    required: ["path"],
  },
  handler: createDirectoryHandler,
};
