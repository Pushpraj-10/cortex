import { registerProvider, ollamaProviderDescriptor } from "@cortex/llm";

/** Registers every LLM provider descriptor this CLI can use. Call once, at startup. */
export function registerLlmProviders(): void {
  registerProvider(ollamaProviderDescriptor);
}
