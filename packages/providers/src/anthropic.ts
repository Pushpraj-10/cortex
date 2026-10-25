/**
 * Anthropic (cloud) provider, via the Messages API: config, wire-format mapping, client
 * and descriptor in one place.
 *
 * The Messages API differs from the OpenAI-style providers in ways the mapping absorbs:
 * the system prompt is a top-level field, not a message; tool calls are `tool_use` content
 * blocks and their results are `tool_result` blocks inside a *user* message; and every
 * `tool_use` must be answered by a `tool_result` with the same id.
 */
import { err, ok, type Result } from "@cortex/core";
import type { ChatMessage, ChatRequest, LLMProvider, LLMProviderDescriptor, ToolCall } from "./types.js";
import { ProviderRequestError, postJson } from "./wire.js";

export interface AnthropicConfig {
  apiKey: string;
  /** Defaults to https://api.anthropic.com. */
  baseUrl?: string;
  model: string;
  /** Upper bound on generated tokens per reply. Defaults to 8192. */
  maxTokens?: number;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 8192;

// ---- wire format -----------------------------------------------------------------

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicBlock[];
}

export interface AnthropicRequestBody {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: { name: string; description: string; input_schema: Record<string, unknown> }[];
  /** The agent loop runs one tool call per turn, so the model is told not to emit several. */
  tool_choice?: { type: "auto"; disable_parallel_tool_use: true };
  temperature?: number;
}

interface AnthropicResponse {
  content?: AnthropicBlock[];
}

/**
 * Our ChatMessage carries no tool-call id, so one is derived from the tool name. That is
 * safe because the agent runs a single tool call per turn, so the name alone pairs a
 * `tool_use` with its `tool_result`.
 */
function toolCallId(toolName: string): string {
  return `call_${toolName}`;
}

/**
 * Maps provider-agnostic messages to Anthropic's shape: system messages are joined into
 * the top-level `system` string, assistant tool calls become `tool_use` blocks, tool results
 * become `tool_result` blocks in a user message, and consecutive same-role messages are merged
 * (with tool results first, as the API requires) so roles strictly alternate.
 */
export function toAnthropicMessages(messages: ChatMessage[]): { system?: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const mapped: AnthropicMessage[] = [];

  const push = (role: AnthropicMessage["role"], blocks: AnthropicBlock[]) => {
    if (blocks.length === 0) return;
    const last = mapped[mapped.length - 1];
    if (last && last.role === role) {
      last.content.push(...blocks);
      // tool_result blocks must precede any text in the same user message
      last.content.sort((a, b) => Number(b.type === "tool_result") - Number(a.type === "tool_result"));
    } else {
      mapped.push({ role, content: blocks });
    }
  };

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else if (message.role === "user") {
      push("user", message.content ? [{ type: "text", text: message.content }] : []);
    } else if (message.role === "assistant") {
      const blocks: AnthropicBlock[] = message.content ? [{ type: "text", text: message.content }] : [];
      for (const call of message.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: toolCallId(call.toolName), name: call.toolName, input: call.args });
      }
      push("assistant", blocks);
    } else {
      push("user", [{ type: "tool_result", tool_use_id: toolCallId(message.name ?? "tool"), content: message.content }]);
    }
  }

  return { system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined, messages: mapped };
}

/** Shapes a non-streaming request for the /v1/messages endpoint. */
export function buildAnthropicRequest(config: AnthropicConfig, request: ChatRequest): AnthropicRequestBody {
  const { system, messages } = toAnthropicMessages(request.messages);
  const hasTools = request.tools !== undefined && request.tools.length > 0;
  return {
    model: config.model,
    max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    system,
    messages,
    tools: hasTools
      ? request.tools!.map((t) => ({ name: t.name, description: t.description, input_schema: t.parametersSchema }))
      : undefined,
    tool_choice: hasTools ? { type: "auto", disable_parallel_tool_use: true } : undefined,
    temperature: request.temperature,
  };
}

/** Joins text blocks and returns the first tool_use as a ToolCall (one action per turn). */
export function fromAnthropicContent(blocks: AnthropicBlock[]): { content: string; toolCalls?: ToolCall[] } {
  const content = blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  const use = blocks.find((b): b is Extract<AnthropicBlock, { type: "tool_use" }> => b.type === "tool_use");
  return use ? { content, toolCalls: [{ toolName: use.name, args: use.input }] } : { content };
}

// ---- client ----------------------------------------------------------------------

export function createAnthropicClient(config: AnthropicConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    async chat(request: ChatRequest): Promise<Result<ChatMessage>> {
      const reply = await postJson<AnthropicResponse>({
        provider: "Anthropic",
        baseUrl,
        url: `${baseUrl}/v1/messages`,
        headers: { "x-api-key": config.apiKey, "anthropic-version": API_VERSION },
        body: buildAnthropicRequest(config, request),
        signal: request.signal,
      });
      if (!reply.ok) return reply;
      if (!reply.value.content) return err(new ProviderRequestError("Anthropic", "Anthropic response had no content"));

      return ok({ role: "assistant", ...fromAnthropicContent(reply.value.content) });
    },
  };
}

/** Not auto-registered; the composition root calls registerLlmProvider() explicitly. */
export const anthropicProviderDescriptor: LLMProviderDescriptor<AnthropicConfig> = {
  id: "anthropic",
  displayName: "Anthropic (cloud)",
  createClient: createAnthropicClient,
};
