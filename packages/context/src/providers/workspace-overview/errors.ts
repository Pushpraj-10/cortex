import { CortexError } from "@cortex/core";

export class WorkspaceOverviewProviderError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONTEXT_WORKSPACE_OVERVIEW_ERROR", cause);
  }
}
