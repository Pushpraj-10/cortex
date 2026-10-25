import {
  registerProvider,
  workspaceOverviewProvider,
  mentionedFilesProvider,
  relatedFilesProvider,
  dependentsProvider,
} from "@cortex/context";

/** Registers every context provider this CLI feeds into the agent's turns. Call once, at startup. */
export function registerContextProviders(): void {
  registerProvider(workspaceOverviewProvider);
  registerProvider(mentionedFilesProvider);
  registerProvider(relatedFilesProvider);
  registerProvider(dependentsProvider);
}
