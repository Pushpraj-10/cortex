import type { LLMProviderDescriptor } from "../core/llm-provider-descriptor.js";
import { createGroqClient } from "./client.js";
import type { GroqConfig } from "./config.js";

/** Groq provider descriptor for registration. Not auto-registered; call registerProvider() explicitly. */
export const groqProviderDescriptor: LLMProviderDescriptor<GroqConfig> = {
  id: "groq",
  displayName: "Groq (cloud)",
  createClient: createGroqClient,
};
