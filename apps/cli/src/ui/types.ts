import type { ToolKind, ToolPreview } from "@cortex/tools";
import type { ToolStatus } from "../format/tool-calls.js";

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
  /** One-line summary shown on the header, e.g. "Read package.json". */
  summary: string;
  /** What the tool does to the world; decides what is shown by default (a diff for edits, output for commands). */
  toolKind?: ToolKind;
  status: ToolStatus;
  /** What the call will change, found before it ran, so the record survives the file changing. */
  preview?: ToolPreview;
  /** When the call started, in ms since the epoch. */
  startedAt: number;
  /** How long it took, once it has finished. */
  durationMs?: number;
  /** One line saying why a call failed or was declined. */
  error?: string;
  /** The result as text; empty until the call finishes. */
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
