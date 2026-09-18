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
}
