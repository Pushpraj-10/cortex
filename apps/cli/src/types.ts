export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
}

export interface ToolCallData {
  id: string;
  /** One-line summary shown collapsed, e.g. "Read package.json". */
  summary: string;
  /** Detail shown when expanded — mock data for now. */
  detail: string;
}

export interface SlashCommand {
  name: string;
  description: string;
}
