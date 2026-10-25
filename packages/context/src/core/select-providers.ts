import type { Logger } from "@cortex/shared";
import type { ContextProvider } from "./context-provider.js";
import type { ContextRequest } from "../types.js";

/**
 * Keeps the providers that apply to this request, preserving registration order. A
 * provider without `applies` always applies; one whose `applies` throws or rejects is
 * treated as not applying, so a buggy predicate can never break a turn.
 */
export async function selectProviders(
  providers: ContextProvider[],
  request: ContextRequest,
  logger?: Logger,
): Promise<ContextProvider[]> {
  const verdicts = await Promise.all(
    providers.map(async (provider): Promise<boolean> => {
      if (!provider.applies) return true;
      try {
        return await provider.applies(request);
      } catch (error) {
        logger?.warn(`context provider "${provider.id}" applies() threw`, { error: String(error) });
        return false;
      }
    }),
  );

  return providers.filter((_, index) => verdicts[index]);
}
