/**
 * The provider registry: the composition root registers providers once at startup; the pipeline reads them every turn.
 */
import { CortexError } from "@cortex/core";
import type { ContextProvider } from "./types.js";

// ---- Registry ----

export class UnknownContextProviderError extends CortexError {
  constructor(id: string) {
    super(`No context provider registered with id "${id}"`, "CONTEXT_UNKNOWN_PROVIDER");
  }
}

/** Maps provider id → provider. Call registerContextProvider(provider) to make one available. */
const registry = new Map<string, ContextProvider>();

export function registerContextProvider(provider: ContextProvider): void {
  registry.set(provider.id, provider);
}

/** Retrieve a registered provider by id. Throws UnknownContextProviderError if it isn't registered. */
export function getContextProvider(id: string): ContextProvider {
  const provider = registry.get(id);
  if (!provider) {
    throw new UnknownContextProviderError(id);
  }
  return provider;
}

/** List all registered providers. */
export function listContextProviders(): ContextProvider[] {
  return Array.from(registry.values());
}
