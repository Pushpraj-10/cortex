import type { Logger } from "@cortex/core";
import type { ContextProvider } from "./context-provider.js";
import type { ContextFragment, ContextRequest } from "../types.js";
import { listProviders } from "./provider-registry.js";
import { selectProviders } from "./select-providers.js";
import { dedupeFragments } from "./dedupe-fragments.js";
import { rankFragments } from "./rank-fragments.js";
import { applyBudget } from "./apply-budget.js";
import { renderContextBlock } from "./render-context-block.js";

/** About 3k tokens — enough for a couple of files plus an overview without crowding the conversation. */
const DEFAULT_MAX_CHARS = 12_000;

export interface GatherContextDeps {
  /** Defaults to every registered provider; overridable for tests. */
  providers?: ContextProvider[];
  logger?: Logger;
  /** Upper bound on the rendered block's size, in characters. Defaults to 12,000. */
  maxChars?: number;
}

/**
 * Assembles the context block for one turn: skips providers that don't apply to the
 * request, queries the rest in parallel (isolating each one's failure so a single bad
 * provider can never break a turn), then drops duplicates, orders what's left by
 * relevance, trims it to the size budget and renders it into one text block.
 * Returns "" when no provider had anything to contribute — never a heading with
 * nothing under it.
 */
export async function gatherContext(request: ContextRequest, deps: GatherContextDeps = {}): Promise<string> {
  const registered = deps.providers ?? listProviders();
  if (registered.length === 0) return "";

  const providers = await selectProviders(registered, request, deps.logger);

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

  const ranked = rankFragments(dedupeFragments(perProvider.flat()));
  return renderContextBlock(applyBudget(ranked, deps.maxChars ?? DEFAULT_MAX_CHARS));
}
