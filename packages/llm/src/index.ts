/**
 * @cortex/llm — provider-agnostic LLM access via a self-registering descriptor
 * registry. Providers (Ollama, Claude, OpenAI, etc.) never appear as hardcoded
 * branches; each self-registers and the composition root controls what's active.
 */

// Shared types
export type { ChatRole, ChatMessage, ToolSpec, ToolCall, ChatRequest } from "./types.js";

// Core provider contract & registry
export type { LLMProvider } from "./core/llm-provider.js";
export type { LLMProviderDescriptor } from "./core/llm-provider-descriptor.js";
export { registerProvider, getProvider, listProviders, UnknownProviderError } from "./core/provider-registry.js";

// Ollama provider
export { createOllamaClient } from "./ollama/client.js";
export { ollamaProviderDescriptor } from "./ollama/descriptor.js";
export { OllamaRequestError } from "./ollama/errors.js";
export type { OllamaConfig } from "./ollama/config.js";
