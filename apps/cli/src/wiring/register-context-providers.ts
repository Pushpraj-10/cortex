import {
  registerContextProvider,
  workspaceOverviewProvider,
  mentionedFilesProvider,
  relatedFilesProvider,
  dependentsProvider,
} from "@cortex/context";

/** Registers every context provider this CLI feeds into the agent's turns. Call once, at startup. */
export function registerContextProviders(): void {
  registerContextProvider(workspaceOverviewProvider);
  registerContextProvider(mentionedFilesProvider);
  registerContextProvider(relatedFilesProvider);
  registerContextProvider(dependentsProvider);
}
