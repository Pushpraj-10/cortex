/**
 * Groq (cloud) provider, via its OpenAI-compatible chat-completions API: config,
 * wire-format mapping, client and descriptor in one place.
 */
import { err, ok, type Result } from "@cortex/core";
import type { ChatMessage, ChatRequest, LLMProvider, LLMProviderDescriptor, ToolCall } from "./types.js";
import { ProviderRequestError, postJson, toFunctionTools, type FunctionToolSpec } from "./wire.js";

export interface GroqConfig {
  apiKey: string;
  /** Defaults to https://api.groq.com/openai/v1. */
  baseUrl?: string;
  model: string;
}

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

// ---- wire format -----------------------------------------------------------------

export interface GroqMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

export interface GroqRequestBody {
  model: string;
  messages: GroqMessage[];
  tools?: FunctionToolSpec[];
  temperature?: number;
}

interface GroqChatResponse {
  choices?: {
    message?: {
      content: string | null;
      tool_calls?: { function: { name: string; arguments: string } }[];
    };
  }[];
}

/**
 * Derives the tool_call id Groq's OpenAI-compatible API requires on both the
 * assistant's tool_calls entry and the paired tool-result message. Our provider-agnostic
 * ChatMessage carries no id (Ollama's native API doesn't need one), so this synthesizes
 * one from the tool name — safe because the agent's tool loop acts on only one tool call
 * at a time, so the name alone disambiguates the pairing.
 */
function toolCallId(toolName: string): string {
  return `call_${toolName}`;
}

/**
 * Maps one ChatMessage to Groq's wire shape. Unlike Ollama, Groq requires
 * tool_calls[].function.arguments as a JSON *string* (not an object) and requires
 * role:"tool" messages to carry a matching tool_call_id.
 */
export function toGroqMessage(message: ChatMessage): GroqMessage {
  const mapped: GroqMessage = { role: message.role, content: message.content };

  if (message.role === "tool" && message.name) {
    mapped.tool_call_id = toolCallId(message.name);
  }

  if (message.toolCalls && message.toolCalls.length > 0) {
    mapped.tool_calls = message.toolCalls.map((call) => ({
      id: toolCallId(call.toolName),
      type: "function",
      function: { name: call.toolName, arguments: JSON.stringify(call.args) },
    }));
  }

  return mapped;
}

/**
 * Maps Groq's message.tool_calls to ToolCall[]. Groq sends `arguments` as a JSON-encoded
 * string (unlike Ollama's native object), so each call's arguments are parsed. Returns
 * undefined (not []) for an absent or empty list.
 */
export function fromGroqToolCalls(toolCalls?: { function: { name: string; arguments: string } }[]): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((call) => ({ toolName: call.function.name, args: JSON.parse(call.function.arguments) }));
}

/** Shapes a non-streaming request for Groq's /chat/completions endpoint. */
export function buildGroqRequest(config: GroqConfig, request: ChatRequest): GroqRequestBody {
  return {
    model: config.model,
    messages: request.messages.map(toGroqMessage),
    tools: request.tools && request.tools.length > 0 ? toFunctionTools(request.tools) : undefined,
    temperature: request.temperature,
  };
}

// ---- client ----------------------------------------------------------------------

export function createGroqClient(config: GroqConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async chat(request: ChatRequest): Promise<Result<ChatMessage>> {
      const reply = await postJson<GroqChatResponse>({
        provider: "Groq",
        baseUrl,
        url: `${baseUrl}/chat/completions`,
        headers: { authorization: `Bearer ${config.apiKey}` },
        body: buildGroqRequest(config, request),
        signal: request.signal,
      });
      if (!reply.ok) return reply;

      const message = reply.value.choices?.[0]?.message;
      if (!message) return err(new ProviderRequestError("Groq", "Groq response had no message"));

      const toolCalls = fromGroqToolCalls(message.tool_calls);
      return ok({ role: "assistant", content: message.content ?? "", ...(toolCalls ? { toolCalls } : {}) });
    },
  };
}

/** Not auto-registered; the composition root calls registerLlmProvider() explicitly. */
export const groqProviderDescriptor: LLMProviderDescriptor<GroqConfig> = {
  id: "groq",
  displayName: "Groq (cloud)",
  createClient: createGroqClient,
};
