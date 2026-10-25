import { CortexError } from "@cortex/core";

export class FileSystemToolError extends CortexError {
  constructor(message: string) {
    super(message, "TOOL_FILE_SYSTEM_ERROR");
  }
}
