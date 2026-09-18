import type { ToolCall } from "../../types.js";

/**
 * Maps Ollama's message.tool_calls response shape to our provider-agnostic
 * ToolCall[]. Returns undefined (rather than []) for an absent or empty list,
 * matching ChatMessage.toolCalls's "unset means no tool call" contract.
 */
export function fromOllamaToolCalls(
  toolCalls?: { function: { name: string; arguments: unknown } }[],
): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((call) => ({ toolName: call.function.name, args: call.function.arguments }));
}
