import type { ChatMessage } from "../../types.js";

export interface GroqMessage {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

/**
 * Derives the tool_call id Groq's OpenAI-compatible API requires on both the
 * assistant's tool_calls entry and the paired tool-result message. Our
 * provider-agnostic ChatMessage carries no id (Ollama's native API doesn't need one),
 * so this synthesizes one from the tool name — safe because `runToolLoop` acts on
 * only one tool call at a time, so name alone disambiguates the pairing.
 */
function toolCallId(toolName: string): string {
  return `call_${toolName}`;
}

/**
 * Maps one provider-agnostic ChatMessage to Groq's OpenAI-compatible wire shape.
 * Unlike Ollama, Groq requires tool_calls[].function.arguments as a JSON *string*
 * (not an object) and requires role:"tool" messages to carry a matching tool_call_id.
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
