// The wire contract with a model provider: messages in, content blocks out.

export type TextBlock = { type: "text"; text: string };
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: Message[];
  tools: ToolSchema[];
  maxTokens: number;
}

export interface LlmResponse {
  content: ContentBlock[];
  stopReason: string;
}

export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
