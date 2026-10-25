/**
 * @cortex/providers — provider-agnostic LLM access via a descriptor registry. Providers
 * (Ollama, Google, Anthropic) never appear as hardcoded branches in consumers; the
 * composition root registers the ones it wants and looks them up by id.
 */

export type {
  ChatMessage,
  ChatRequest,
  ChatRole,
  LLMProvider,
  LLMProviderDescriptor,
  StreamEvent,
  ToolCall,
  ToolSpec,
} from "./types.js";
export { UnknownProviderError, getLlmProvider, registerLlmProvider } from "./registry.js";
export { ProviderRequestError } from "./wire.js";

export { anthropicProviderDescriptor, createAnthropicClient, type AnthropicConfig } from "./anthropic.js";
export { createGoogleClient, googleProviderDescriptor, type GoogleConfig } from "./google.js";
export { createOllamaClient, ollamaProviderDescriptor, type OllamaConfig } from "./ollama.js";
