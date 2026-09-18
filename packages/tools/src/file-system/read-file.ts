import { promises as fs } from "node:fs";
import { ok, err, resolveWorkspacePath, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface ReadFileArgs {
  path: string;
}

interface ReadFileResult {
  content: string;
}

async function readFileHandler(args: ReadFileArgs, context: ToolExecutionContext): Promise<Result<ReadFileResult>> {
  try {
    const resolvedPath = resolveWorkspacePath(context.cwd, args.path);
    const content = await fs.readFile(resolvedPath, "utf-8");
    return ok({ content });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to read file at ${args.path}: ${error}`));
  }
}

export const readFileTool: ToolDefinition<ReadFileArgs, ReadFileResult> = {
  name: "read_file",
  description: "Read the full contents of a file",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
    },
    required: ["path"],
  },
  handler: readFileHandler,
};
