import { CortexError } from "@cortex/core";

export class WorkspaceReadError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONTEXT_WORKSPACE_READ_ERROR", cause);
  }
}
