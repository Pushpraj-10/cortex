import { promises as fs } from "node:fs";
import { ok, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";

interface FileExistsArgs {
  path: string;
}

interface FileExistsResult {
  exists: boolean;
}

async function fileExistsHandler(args: FileExistsArgs, context: ToolExecutionContext): Promise<Result<FileExistsResult>> {
  try {
    await fs.access(args.path);
    return ok({ exists: true });
  } catch {
    return ok({ exists: false });
  }
}

export const fileExistsTool: ToolDefinition<FileExistsArgs, FileExistsResult> = {
  name: "file_exists",
  description: "Check whether a file or directory exists",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to check (relative to workspace root)" },
    },
    required: ["path"],
  },
  handler: fileExistsHandler,
};
