/**
 * @cortex/context — a self-registering registry of context providers that enrich
 * each agent turn with relevant project information. Providers never appear as
 * hardcoded branches; the composition root registers what it wants. Each turn,
 * `gatherContext` skips providers that don't apply to the request, ranks what the rest
 * return by relevance and trims the result to a size budget.
 */

// Shared types
export type { ContextRequest, ContextFragment } from "./types.js";

// Core contract & registry
export type { ContextProvider } from "./core/context-provider.js";
export { registerProvider, getProvider, listProviders, UnknownProviderError } from "./core/provider-registry.js";
export { gatherContext, type GatherContextDeps } from "./core/gather-context.js";
export { renderContextBlock } from "./core/render-context-block.js";

// Workspace overview provider
export { workspaceOverviewProvider } from "./providers/workspace-overview/workspace-overview-provider.js";
export { WorkspaceOverviewProviderError } from "./providers/workspace-overview/errors.js";
export type { WorkspaceOverviewData } from "./providers/workspace-overview/format-overview.js";

// Mentioned-files provider: attaches the files the user's message names
export { mentionedFilesProvider } from "./providers/mentioned-files/mentioned-files-provider.js";

// Related-files provider: the imports and tests of the files the user's message names
export { relatedFilesProvider } from "./providers/related-files/related-files-provider.js";

// Dependents provider: which files import the files the user's message names (the ripple of an edit)
export { dependentsProvider } from "./providers/dependents/dependents-provider.js";

// Import graph: the incrementally-indexed layer behind the dependents provider
export { getImportGraph } from "./graph/get-import-graph.js";
export { findDependents, type FindDependentsOptions } from "./graph/find-dependents.js";
export { clearImportIndexCache } from "./graph/import-index-cache.js";
export type { ImportGraph, Dependent } from "./graph/types.js";
