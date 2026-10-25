import type { ChatMessage } from "../../types.js";

export interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: unknown } }[];
}

/**
 * Maps one provider-agnostic ChatMessage to Ollama's wire shape, forwarding
 * toolCalls when present. This matters for replaying history: Ollama expects the
 * same OpenAI-style function-calling conversation shape — an assistant turn carrying
 * tool_calls, followed by a role:"tool" result message — so an earlier turn's tool
 * call has to survive being sent back, not just its result.
 */
export function toOllamaMessage(message: ChatMessage): OllamaMessage {
  const mapped: OllamaMessage = { role: message.role, content: message.content };
  if (message.toolCalls && message.toolCalls.length > 0) {
    mapped.tool_calls = message.toolCalls.map((call) => ({
      function: { name: call.toolName, arguments: call.args },
    }));
  }
  return mapped;
}
