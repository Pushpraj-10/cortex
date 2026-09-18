import { promises as fs } from "node:fs";
import { ok, err, type Result } from "@cortex/shared";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { FileSystemToolError } from "./errors.js";

interface EditFileArgs {
  path: string;
  oldString: string;
  newString: string;
}

interface EditFileResult {
  success: boolean;
  applied: boolean;
}

async function editFileHandler(args: EditFileArgs, context: ToolExecutionContext): Promise<Result<EditFileResult>> {
  try {
    const content = await fs.readFile(args.path, "utf-8");

    if (!content.includes(args.oldString)) {
      return ok({ success: false, applied: false });
    }

    const newContent = content.replace(args.oldString, args.newString);
    await fs.writeFile(args.path, newContent, "utf-8");

    return ok({ success: true, applied: true });
  } catch (error) {
    return err(new FileSystemToolError(`Failed to edit file at ${args.path}: ${error}`));
  }
}

export const editFileTool: ToolDefinition<EditFileArgs, EditFileResult> = {
  name: "edit_file",
  description: "Apply a targeted modification to a file by replacing a string",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
      oldString: { type: "string", description: "The exact string to find and replace" },
      newString: { type: "string", description: "The replacement string" },
    },
    required: ["path", "oldString", "newString"],
  },
  handler: editFileHandler,
};
