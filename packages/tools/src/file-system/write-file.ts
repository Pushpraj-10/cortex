import { promises as fs } from "node:fs";
import path from "node:path";
import { ok, err, resolveWorkspacePath, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface WriteFileArgs {
  path: string;
  content: string;
}

interface WriteFileResult {
  success: boolean;
}

async function writeFileHandler(args: WriteFileArgs, context: ToolExecutionContext): Promise<Result<WriteFileResult>> {
  try {
    const resolvedPath = resolveWorkspacePath(context.cwd, args.path);
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolvedPath, args.content, "utf-8");
    return ok({ success: true });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to write file at ${args.path}: ${error}`));
  }
}

export const writeFileTool: ToolDefinition<WriteFileArgs, WriteFileResult> = {
  name: "write_file",
  description: "Create or overwrite a file with the given content",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
      content: { type: "string", description: "File contents" },
    },
    required: ["path", "content"],
  },
  handler: writeFileHandler,
};
