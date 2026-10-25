import type { LLMProvider } from "./llm-provider.js";

/**
 * Descriptor for a provider — metadata + factory function to create a client.
 * Providers self-register themselves; the composition root decides which ones are active.
 */
export interface LLMProviderDescriptor<TConfig = unknown> {
  id: string;
  displayName: string;
  createClient(config: TConfig): LLMProvider;
}
