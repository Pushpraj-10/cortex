import { CortexError } from "@cortex/shared";
import type { LLMProviderDescriptor } from "./llm-provider-descriptor.js";

export class UnknownProviderError extends CortexError {
  constructor(id: string) {
    super(`No LLM provider registered with id "${id}"`, "LLM_UNKNOWN_PROVIDER");
  }
}

/** Maps provider id → descriptor. Call registerProvider(descriptor) on load. */
const registry = new Map<string, LLMProviderDescriptor>();

/**
 * Register a provider so it can be looked up by id.
 * Call this once per provider in the composition root (apps/cli).
 */
export function registerProvider(descriptor: LLMProviderDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

/**
 * Retrieve a registered provider by id.
 * Throws UnknownProviderError if the provider is not registered.
 */
export function getProvider(id: string): LLMProviderDescriptor {
  const descriptor = registry.get(id);
  if (!descriptor) {
    throw new UnknownProviderError(id);
  }
  return descriptor;
}

/** List all registered providers. */
export function listProviders(): LLMProviderDescriptor[] {
  return Array.from(registry.values());
}
