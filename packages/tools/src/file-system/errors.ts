import { CortexError } from "@cortex/shared";

export class FileSystemToolError extends CortexError {
  constructor(message: string) {
    super(message, "TOOL_FILE_SYSTEM_ERROR");
  }
}
