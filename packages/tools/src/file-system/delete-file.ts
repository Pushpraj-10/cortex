import { promises as fs } from "node:fs";
import { ok, err, resolveWorkspacePath, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface DeleteFileArgs {
  path: string;
}

interface DeleteFileResult {
  success: boolean;
}

async function deleteFileHandler(args: DeleteFileArgs, context: ToolExecutionContext): Promise<Result<DeleteFileResult>> {
  try {
    const resolvedPath = resolveWorkspacePath(context.cwd, args.path);
    await fs.unlink(resolvedPath);
    return ok({ success: true });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to delete file at ${args.path}: ${error}`));
  }
}

export const deleteFileTool: ToolDefinition<DeleteFileArgs, DeleteFileResult> = {
  name: "delete_file",
  description: "Delete a file",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
    },
    required: ["path"],
  },
  handler: deleteFileHandler,
};
