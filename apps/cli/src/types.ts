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

/** A one-off line from the app itself (help text, a mode change, "context compacted") — not from the model. */
export interface NoticeEntry {
  kind: "notice";
  id: string;
  text: string;
}

/** One entry in the conversation, in the order it happened. */
export type TimelineEntry = MessageEntry | ToolCallEntry | NoticeEntry;

export interface SlashCommand {
  name: string;
  description: string;
}
