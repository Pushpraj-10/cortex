import type { ToolCall } from "../../types.js";

interface GroqToolCall {
  function: { name: string; arguments: string };
}

/**
 * Maps Groq's OpenAI-compatible message.tool_calls response shape to our
 * provider-agnostic ToolCall[]. Groq sends `arguments` as a JSON-encoded string
 * (unlike Ollama's native object), so each call's arguments must be parsed.
 * Returns undefined (rather than []) for an absent or empty list, matching
 * ChatMessage.toolCalls's "unset means no tool call" contract.
 */
export function fromGroqToolCalls(toolCalls?: GroqToolCall[]): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((call) => ({ toolName: call.function.name, args: JSON.parse(call.function.arguments) }));
}
