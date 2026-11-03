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
  ModelInfo,
  StreamEvent,
  ToolCall,
  ToolSpec,
} from "./types.js";
export { UnknownProviderError, getLlmProvider, registerLlmProvider } from "./registry.js";
export { ProviderRequestError } from "./wire.js";

export {
  DEFAULT_BASE_URL as DEFAULT_ANTHROPIC_BASE_URL,
  anthropicProviderDescriptor,
  createAnthropicClient,
  type AnthropicConfig,
} from "./anthropic.js";
export { DEFAULT_BASE_URL as DEFAULT_GOOGLE_BASE_URL, createGoogleClient, googleProviderDescriptor, type GoogleConfig } from "./google.js";
export { DEFAULT_BASE_URL as DEFAULT_OLLAMA_BASE_URL, createOllamaClient, ollamaProviderDescriptor, type OllamaConfig } from "./ollama.js";
