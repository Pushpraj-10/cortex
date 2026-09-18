import { CortexError } from "@cortex/shared";
import type { ContextProvider } from "./context-provider.js";

export class UnknownProviderError extends CortexError {
  constructor(id: string) {
    super(`No context provider registered with id "${id}"`, "CONTEXT_UNKNOWN_PROVIDER");
  }
}

/** Maps provider id → provider. Call registerProvider(provider) to make one available. */
const registry = new Map<string, ContextProvider>();

export function registerProvider(provider: ContextProvider): void {
  registry.set(provider.id, provider);
}

/** Retrieve a registered provider by id. Throws UnknownProviderError if it isn't registered. */
export function getProvider(id: string): ContextProvider {
  const provider = registry.get(id);
  if (!provider) {
    throw new UnknownProviderError(id);
  }
  return provider;
}

/** List all registered providers. */
export function listProviders(): ContextProvider[] {
  return Array.from(registry.values());
}
