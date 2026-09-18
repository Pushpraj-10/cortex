import { promises as fs } from "node:fs";
import path from "node:path";
import { ok, err, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface MoveFileArgs {
  from: string;
  to: string;
}

interface MoveFileResult {
  success: boolean;
}

async function moveFileHandler(args: MoveFileArgs, context: ToolExecutionContext): Promise<Result<MoveFileResult>> {
  try {
    const toDir = path.dirname(args.to);
    await fs.mkdir(toDir, { recursive: true });
    await fs.rename(args.from, args.to);
    return ok({ success: true });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to move file from ${args.from} to ${args.to}: ${error}`));
  }
}

export const moveFileTool: ToolDefinition<MoveFileArgs, MoveFileResult> = {
  name: "move_file",
  description: "Move or rename a file",
  parametersSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Source path (relative to workspace root)" },
      to: { type: "string", description: "Destination path (relative to workspace root)" },
    },
    required: ["from", "to"],
  },
  handler: moveFileHandler,
};
