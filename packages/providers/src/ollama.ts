/**
 * Ollama (local) provider: config, wire-format mapping, client and descriptor in one place.
 * Ollama's native /api/chat takes tool-call arguments as objects and needs no call ids.
 */
import { err, ok, type Result } from "@cortex/core";
import type { ChatMessage, ChatRequest, LLMProvider, LLMProviderDescriptor, ToolCall } from "./types.js";
import { ProviderRequestError, postJson, toFunctionTools, type FunctionToolSpec } from "./wire.js";

export interface OllamaConfig {
  /** Defaults to http://localhost:11434. */
  baseUrl?: string;
  model: string;
}

const DEFAULT_BASE_URL = "http://localhost:11434";

// ---- wire format -----------------------------------------------------------------

interface OllamaToolCall {
  function: { name: string; arguments: unknown };
}

export interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaRequestBody {
  model: string;
  messages: OllamaMessage[];
  tools?: FunctionToolSpec[];
  stream: false;
  options?: { temperature: number };
}

interface OllamaChatResponse {
  message?: { content: string; tool_calls?: OllamaToolCall[] };
}

/**
 * Maps one provider-agnostic ChatMessage to Ollama's wire shape, forwarding toolCalls
 * when present. This matters for replaying history: Ollama expects the OpenAI-style
 * conversation shape — an assistant turn carrying tool_calls, followed by a role:"tool"
 * result message — so an earlier turn's tool call has to survive being sent back, not
 * just its result.
 */
export function toOllamaMessage(message: ChatMessage): OllamaMessage {
  const mapped: OllamaMessage = { role: message.role, content: message.content };
  if (message.toolCalls && message.toolCalls.length > 0) {
    mapped.tool_calls = message.toolCalls.map((call) => ({ function: { name: call.toolName, arguments: call.args } }));
  }
  return mapped;
}

/**
 * Maps Ollama's message.tool_calls to ToolCall[]. Returns undefined (not []) for an
 * absent or empty list, matching ChatMessage.toolCalls's "unset means no tool call" contract.
 */
export function fromOllamaToolCalls(toolCalls?: OllamaToolCall[]): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((call) => ({ toolName: call.function.name, args: call.function.arguments }));
}

/** Shapes a non-streaming request for Ollama's /api/chat endpoint. */
export function buildOllamaRequest(config: OllamaConfig, request: ChatRequest): OllamaRequestBody {
  return {
    model: config.model,
    messages: request.messages.map(toOllamaMessage),
    tools: request.tools && request.tools.length > 0 ? toFunctionTools(request.tools) : undefined,
    stream: false,
    options: request.temperature !== undefined ? { temperature: request.temperature } : undefined,
  };
}

// ---- client ----------------------------------------------------------------------

export function createOllamaClient(config: OllamaConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async chat(request: ChatRequest): Promise<Result<ChatMessage>> {
      const reply = await postJson<OllamaChatResponse>({
        provider: "Ollama",
        baseUrl,
        url: `${baseUrl}/api/chat`,
        body: buildOllamaRequest(config, request),
        signal: request.signal,
      });
      if (!reply.ok) return reply;
      if (!reply.value.message) return err(new ProviderRequestError("Ollama", "Ollama response had no message"));

      const { content, tool_calls } = reply.value.message;
      const toolCalls = fromOllamaToolCalls(tool_calls);
      return ok({ role: "assistant", content, ...(toolCalls ? { toolCalls } : {}) });
    },
  };
}

/** Not auto-registered; the composition root calls registerLlmProvider() explicitly. */
export const ollamaProviderDescriptor: LLMProviderDescriptor<OllamaConfig> = {
  id: "ollama",
  displayName: "Ollama (local)",
  createClient: createOllamaClient,
};
