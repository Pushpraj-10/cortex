import type { ChatMessage, ChatRequest } from "../types.js";
import type { Result } from "@cortex/shared";

/** Base interface for LLM providers. Concrete providers (Ollama, Claude, etc.) implement this. */
export interface LLMProvider {
  /**
   * Send a chat request to the model and return the full response.
   * Non-streaming: waits for the entire response before returning.
   */
  chat(request: ChatRequest): Promise<Result<ChatMessage>>;
}
