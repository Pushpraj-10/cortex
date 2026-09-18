/**
 * @cortex/context — a self-registering registry of context providers that enrich
 * each agent turn with relevant project information. Providers never appear as
 * hardcoded branches; the composition root registers what it wants.
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
