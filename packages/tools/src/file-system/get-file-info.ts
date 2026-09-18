import { promises as fs } from "node:fs";
import { ok, err, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface GetFileInfoArgs {
  path: string;
}

interface GetFileInfoResult {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modified: string;
  created: string;
}

async function getFileInfoHandler(args: GetFileInfoArgs, context: ToolExecutionContext): Promise<Result<GetFileInfoResult>> {
  try {
    const stats = await fs.stat(args.path);
    return ok({
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to get file info for ${args.path}: ${error}`));
  }
}

export const getFileInfoTool: ToolDefinition<GetFileInfoArgs, GetFileInfoResult> = {
  name: "get_file_info",
  description: "Get file metadata like size, timestamps, and type",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
    },
    required: ["path"],
  },
  handler: getFileInfoHandler,
};
