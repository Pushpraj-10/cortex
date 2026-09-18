import { promises as fs } from "node:fs";
import path from "node:path";
import { ok, err, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface CopyFileArgs {
  from: string;
  to: string;
}

interface CopyFileResult {
  success: boolean;
}

async function copyFileHandler(args: CopyFileArgs, context: ToolExecutionContext): Promise<Result<CopyFileResult>> {
  try {
    const toDir = path.dirname(args.to);
    await fs.mkdir(toDir, { recursive: true });
    await fs.copyFile(args.from, args.to);
    return ok({ success: true });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to copy file from ${args.from} to ${args.to}: ${error}`));
  }
}

export const copyFileTool: ToolDefinition<CopyFileArgs, CopyFileResult> = {
  name: "copy_file",
  description: "Copy a file to a new location",
  parametersSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Source path (relative to workspace root)" },
      to: { type: "string", description: "Destination path (relative to workspace root)" },
    },
    required: ["from", "to"],
  },
  handler: copyFileHandler,
};
