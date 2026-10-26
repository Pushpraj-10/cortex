/**
 * The provider-agnostic contract: what a chat request and reply look like, what an
 * LLM provider is, and how a provider describes itself to the registry. Concrete
 * providers (Ollama, Google, Anthropic) translate to and from their own wire formats;
 * nothing outside this package ever sees those formats.
 */
import type { Result } from "@cortex/core";

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** One tool the model may call, alongside its JSON-schema argument shape. */
export interface ToolSpec {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
}

/** One tool invocation the model asked for. */
export interface ToolCall {
  toolName: string;
  args: unknown;
  /** Opaque token some providers (Gemini 3) attach to a call and require echoed back when it is replayed. */
  thoughtSignature?: string;
}

export interface ChatMessage {
  role: ChatRole;
  /** May be "" when the message is purely a tool call and carries no text. */
  content: string;
  name?: string;
  /** Set on an assistant message that requested one or more tool calls. */
  toolCalls?: ToolCall[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Tools the model may call natively. Omit to disable tool-calling for the request. */
  tools?: ToolSpec[];
  temperature?: number;
  /** Aborts the underlying request when triggered. */
  signal?: AbortSignal;
}

/**
 * What a streaming reply is made of, in order: any number of `text` pieces as the model writes, then exactly one
 * `done` carrying the complete message (the same message `chat` would have returned, tool calls included), or one
 * `error` if the request failed or the stream ended before it was finished. Failures are events, not exceptions.
 */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; error: Error };

/** Base interface for LLM providers. */
export interface LLMProvider {
  /**
   * Send a chat request to the model and return the full response.
   * Non-streaming: waits for the entire response before returning.
   */
  chat(request: ChatRequest): Promise<Result<ChatMessage>>;
  /**
   * The same request, answered as a stream so the text can be shown as it is written. Optional: a provider that
   * cannot stream simply omits it and callers use `chat`.
   */
  chatStream?(request: ChatRequest): AsyncGenerator<StreamEvent, void, void>;
}

/**
 * Descriptor for a provider — metadata + factory function to create a client.
 * Providers do not register themselves; the composition root decides which are active.
 */
export interface LLMProviderDescriptor<TConfig = unknown> {
  id: string;
  displayName: string;
  createClient(config: TConfig): LLMProvider;
}
