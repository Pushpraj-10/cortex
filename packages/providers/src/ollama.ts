/**
 * Ollama (local) provider: config, wire-format mapping, client and descriptor in one place.
 * Ollama's native /api/chat takes tool-call arguments as objects and needs no call ids.
 */
import { err, ok, type Result } from "@cortex/core";
import type { ChatMessage, ChatRequest, LLMProvider, LLMProviderDescriptor, StreamEvent, ToolCall, ToolSpec } from "./types.js";
import { ProviderRequestError, postJson, postStream, readLines, streamInterrupted } from "./wire.js";

export interface OllamaConfig {
  /** Defaults to http://localhost:11434. */
  baseUrl?: string;
  model: string;
}

const DEFAULT_BASE_URL = "http://localhost:11434";

// ---- wire format -----------------------------------------------------------------

/** The function-calling tool schema Ollama's /api/chat takes. */
export interface FunctionToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export function toFunctionTools(tools: ToolSpec[]): FunctionToolSpec[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parametersSchema },
  }));
}

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
  stream: boolean;
  options?: { temperature: number };
}

interface OllamaChatResponse {
  message?: { content: string; tool_calls?: OllamaToolCall[] };
}

/** One line of a streamed reply: a piece of the message, and `done` on the last. An `error` replaces the message. */
interface OllamaStreamChunk {
  message?: { content?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
  error?: string;
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

    /** Streams from /api/chat (newline-delimited JSON). A stream that ends without its `done` line is an error, never a truncated answer. */
    async *chatStream(request: ChatRequest): AsyncGenerator<StreamEvent, void, void> {
      const opened = await postStream({
        provider: "Ollama",
        baseUrl,
        url: `${baseUrl}/api/chat`,
        body: { ...buildOllamaRequest(config, request), stream: true },
        signal: request.signal,
      });
      if (!opened.ok) {
        yield { type: "error", error: opened.error };
        return;
      }

      let content = "";
      const toolCalls: OllamaToolCall[] = [];
      try {
        for await (const line of readLines(opened.value)) {
          if (line.trim() === "") continue;
          let chunk: OllamaStreamChunk;
          try {
            chunk = JSON.parse(line) as OllamaStreamChunk;
          } catch (error) {
            yield { type: "error", error: new ProviderRequestError("Ollama", "Ollama sent a reply that is not valid JSON", error) };
            return;
          }
          if (chunk.error) {
            yield { type: "error", error: new ProviderRequestError("Ollama", `Ollama stream error: ${chunk.error}`) };
            return;
          }

          const piece = chunk.message?.content ?? "";
          if (piece !== "") {
            content += piece;
            yield { type: "text", delta: piece };
          }
          if (chunk.message?.tool_calls) toolCalls.push(...chunk.message.tool_calls);

          if (chunk.done) {
            const calls = fromOllamaToolCalls(toolCalls);
            yield { type: "done", message: { role: "assistant", content, ...(calls ? { toolCalls: calls } : {}) } };
            return;
          }
        }
      } catch (error) {
        yield { type: "error", error: streamInterrupted("Ollama", error) };
        return;
      }
      yield { type: "error", error: new ProviderRequestError("Ollama", "Ollama stream ended before the reply was finished") };
    },
  };
}

/** Not auto-registered; the composition root calls registerLlmProvider() explicitly. */
export const ollamaProviderDescriptor: LLMProviderDescriptor<OllamaConfig> = {
  id: "ollama",
  displayName: "Ollama (local)",
  createClient: createOllamaClient,
};
