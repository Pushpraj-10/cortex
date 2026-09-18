import { CortexError } from "@cortex/shared";

export class WorkspaceOverviewProviderError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONTEXT_WORKSPACE_OVERVIEW_ERROR", cause);
  }
}
