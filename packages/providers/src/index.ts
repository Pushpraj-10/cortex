/**
 * @cortex/providers — provider-agnostic LLM access via a descriptor registry. Providers
 * (Ollama, Groq, Anthropic) never appear as hardcoded branches in consumers; the
 * composition root registers the ones it wants and looks them up by id.
 */

export type {
  ChatMessage,
  ChatRequest,
  ChatRole,
  LLMProvider,
  LLMProviderDescriptor,
  ToolCall,
  ToolSpec,
} from "./types.js";
export { UnknownProviderError, getLlmProvider, registerLlmProvider } from "./registry.js";
export { ProviderRequestError } from "./wire.js";

export { anthropicProviderDescriptor, createAnthropicClient, type AnthropicConfig } from "./anthropic.js";
export { createGroqClient, groqProviderDescriptor, type GroqConfig } from "./groq.js";
export { createOllamaClient, ollamaProviderDescriptor, type OllamaConfig } from "./ollama.js";
