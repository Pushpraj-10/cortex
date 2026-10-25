/**
 * @cortex/context — a registry of context providers that enrich each agent turn with relevant
 * project information. Providers never appear as hardcoded branches; the composition root
 * registers what it wants. Each turn, `gatherContext` skips providers that don't apply to the
 * request, ranks what the rest return by relevance and trims the result to a size budget.
 */

export type { ContextFragment, ContextProvider, ContextRequest } from "./types.js";
export { registerContextProvider } from "./registry.js";
export { gatherContext } from "./pipeline.js";
export { walkWorkspace, IGNORED_NAMES } from "./workspace.js";
export type { WalkWorkspaceOptions } from "./workspace.js";

export { dependentsProvider } from "./providers/dependents.js";
export { mentionedFilesProvider } from "./providers/mentioned-files.js";
export { relatedFilesProvider } from "./providers/related-files.js";
export { workspaceOverviewProvider } from "./providers/workspace-overview.js";
