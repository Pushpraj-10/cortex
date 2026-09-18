import type { Logger } from "@cortex/shared";
import type { ContextProvider } from "./context-provider.js";
import type { ContextFragment, ContextRequest } from "../types.js";
import { listProviders } from "./provider-registry.js";
import { renderContextBlock } from "./render-context-block.js";

export interface GatherContextDeps {
  /** Defaults to every registered provider; overridable for tests. */
  providers?: ContextProvider[];
  logger?: Logger;
}

/**
 * Queries every provider in parallel, isolates each one's failure so a single bad
 * provider can never break a turn, and renders the survivors into one text block.
 * Returns "" when no provider had anything to contribute — never a heading with
 * nothing under it.
 */
export async function gatherContext(request: ContextRequest, deps: GatherContextDeps = {}): Promise<string> {
  const providers = deps.providers ?? listProviders();
  if (providers.length === 0) return "";

  const perProvider = await Promise.all(
    providers.map(async (provider): Promise<ContextFragment[]> => {
      try {
        const result = await provider.gather(request);
        if (!result.ok) {
          deps.logger?.warn(`context provider "${provider.id}" failed`, { error: result.error.message });
          return [];
        }
        return result.value;
      } catch (error) {
        deps.logger?.warn(`context provider "${provider.id}" threw`, { error: String(error) });
        return [];
      }
    }),
  );

  return renderContextBlock(perProvider.flat());
}
