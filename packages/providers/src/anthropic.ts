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
import type { ChatMessage, ChatRequest, LLMProvider, LLMProviderDescriptor, StreamEvent, ToolCall } from "./types.js";
import { ProviderRequestError, postJson, postStream, readSseData, streamInterrupted } from "./wire.js";

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
  stream?: boolean;
}

/** The server-sent events of a streamed reply that matter here; the rest (ping, message_start, message_delta) are ignored. */
type AnthropicStreamEvent =
  | { type: "content_block_start"; index: number; content_block: { type: string; text?: string; id?: string; name?: string } }
  | { type: "content_block_delta"; index: number; delta: { type: string; text?: string; partial_json?: string } }
  | { type: "message_stop" }
  | { type: "error"; error?: { message?: string } }
  | { type: string };

/** A content block being assembled from its deltas. */
type PendingBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; json: string } | { type: "other" };

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

    /**
     * Streams from /v1/messages with `stream: true`. Text is passed on as it is written; a tool call's arguments
     * arrive as JSON fragments, so each tool_use block is assembled and parsed once, when the reply is complete. A
     * stream that ends without `message_stop` is an error, never a truncated answer.
     */
    async *chatStream(request: ChatRequest): AsyncGenerator<StreamEvent, void, void> {
      const opened = await postStream({
        provider: "Anthropic",
        baseUrl,
        url: `${baseUrl}/v1/messages`,
        headers: { "x-api-key": config.apiKey, "anthropic-version": API_VERSION },
        body: { ...buildAnthropicRequest(config, request), stream: true },
        signal: request.signal,
      });
      if (!opened.ok) {
        yield { type: "error", error: opened.error };
        return;
      }

      const blocks: PendingBlock[] = [];
      let finished = false;
      try {
        for await (const data of readSseData(opened.value)) {
          let event: AnthropicStreamEvent;
          try {
            event = JSON.parse(data) as AnthropicStreamEvent;
          } catch (error) {
            yield { type: "error", error: new ProviderRequestError("Anthropic", "Anthropic sent a reply that is not valid JSON", error) };
            return;
          }

          if (event.type === "content_block_start") {
            const { index, content_block: block } = event as Extract<AnthropicStreamEvent, { type: "content_block_start" }>;
            if (block.type === "text") {
              blocks[index] = { type: "text", text: block.text ?? "" };
              if (block.text) yield { type: "text", delta: block.text };
            } else if (block.type === "tool_use") {
              blocks[index] = { type: "tool_use", id: block.id ?? "", name: block.name ?? "", json: "" };
            } else {
              blocks[index] = { type: "other" }; // e.g. "thinking": not part of the reply we pass on
            }
          } else if (event.type === "content_block_delta") {
            const { index, delta } = event as Extract<AnthropicStreamEvent, { type: "content_block_delta" }>;
            const block = blocks[index];
            if (block?.type === "text" && delta.type === "text_delta" && delta.text) {
              block.text += delta.text;
              yield { type: "text", delta: delta.text };
            } else if (block?.type === "tool_use" && delta.type === "input_json_delta") {
              block.json += delta.partial_json ?? "";
            }
          } else if (event.type === "message_stop") {
            finished = true;
          } else if (event.type === "error") {
            const message = (event as Extract<AnthropicStreamEvent, { type: "error" }>).error?.message ?? "unknown error";
            yield { type: "error", error: new ProviderRequestError("Anthropic", `Anthropic stream error: ${message}`) };
            return;
          }
        }
      } catch (error) {
        yield { type: "error", error: streamInterrupted("Anthropic", error) };
        return;
      }

      if (!finished) {
        yield { type: "error", error: new ProviderRequestError("Anthropic", "Anthropic stream ended before the reply was finished") };
        return;
      }

      const content: AnthropicBlock[] = [];
      for (const block of blocks) {
        if (block?.type === "text") {
          content.push({ type: "text", text: block.text });
        } else if (block?.type === "tool_use") {
          try {
            content.push({ type: "tool_use", id: block.id, name: block.name, input: block.json === "" ? {} : JSON.parse(block.json) });
          } catch (error) {
            yield { type: "error", error: new ProviderRequestError("Anthropic", `Anthropic sent arguments for ${block.name} that are not valid JSON`, error) };
            return;
          }
        }
      }
      yield { type: "done", message: { role: "assistant", ...fromAnthropicContent(content) } };
    },
  };
}

/** Not auto-registered; the composition root calls registerLlmProvider() explicitly. */
export const anthropicProviderDescriptor: LLMProviderDescriptor<AnthropicConfig> = {
  id: "anthropic",
  displayName: "Anthropic (cloud)",
  createClient: createAnthropicClient,
};
