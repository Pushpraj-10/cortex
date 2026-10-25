import { CortexError } from "@cortex/core";
import type { LLMProviderDescriptor } from "./types.js";

export class UnknownProviderError extends CortexError {
  constructor(id: string) {
    super(`No LLM provider registered with id "${id}"`, "LLM_UNKNOWN_PROVIDER");
  }
}

/** Maps provider id → descriptor. The composition root fills it once at startup. */
const registry = new Map<string, LLMProviderDescriptor>();

/** Register a provider so it can be looked up by id. Registering the same id again replaces it. */
export function registerLlmProvider(descriptor: LLMProviderDescriptor): void {
  registry.set(descriptor.id, descriptor);
}

/** Retrieve a registered provider by id. Throws UnknownProviderError if it is not registered. */
export function getLlmProvider(id: string): LLMProviderDescriptor {
  const descriptor = registry.get(id);
  if (!descriptor) throw new UnknownProviderError(id);
  return descriptor;
}
