import type { LLMProviderDescriptor } from "../core/llm-provider-descriptor.js";
import { createOllamaClient } from "./client.js";
import type { OllamaConfig } from "./config.js";

/** Ollama provider descriptor for registration. Not auto-registered; call registerProvider() explicitly. */
export const ollamaProviderDescriptor: LLMProviderDescriptor<OllamaConfig> = {
  id: "ollama",
  displayName: "Ollama (local)",
  createClient: createOllamaClient,
};
