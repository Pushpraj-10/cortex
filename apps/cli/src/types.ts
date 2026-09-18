export type MessageRole = "user" | "assistant";

export interface MessageEntry {
  kind: "message";
  id: string;
  role: MessageRole;
  content: string;
  /** True for the "LLM request failed" message an unreachable/erroring model produces. */
  isError?: boolean;
}

export interface ToolCallEntry {
  kind: "toolCall";
  id: string;
  /** One-line summary shown collapsed, e.g. "Read package.json". */
  summary: string;
  /** Detail shown when expanded. */
  detail: string;
}

/** One entry in the conversation, in the order it happened — a message or a tool call. */
export type TimelineEntry = MessageEntry | ToolCallEntry;

export interface SlashCommand {
  name: string;
  description: string;
}
