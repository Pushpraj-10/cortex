import { registerLlmProvider, anthropicProviderDescriptor, ollamaProviderDescriptor, groqProviderDescriptor } from "@cortex/providers";

/** Registers every LLM provider descriptor this CLI can use. Call once, at startup. */
export function registerLlmProviders(): void {
  registerLlmProvider(ollamaProviderDescriptor);
  registerLlmProvider(groqProviderDescriptor);
  registerLlmProvider(anthropicProviderDescriptor);
}
