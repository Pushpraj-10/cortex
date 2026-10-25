import type { HookDef } from "../hooks/types";
import type { LlmProvider, Message } from "../llm/types";
import type { PermissionMode, PermissionRules } from "../permissions/types";
import type { ToolDef } from "../tools/types";

/** Everything the loop needs. Built once by the composition root (cli), passed down explicitly. */
export interface AgentOptions {
  provider: LlmProvider;
  system: string;
  tools: ToolDef[];
  mode: PermissionMode;
  rules: PermissionRules;
  hooks: HookDef[];
  cwd: string;
  /** Called when policy says "ask". Resolve true to proceed. */
  askPermission: (name: string, input: Record<string, unknown>) => Promise<boolean>;
  onEvent?: (e: AgentEvent) => void;
  maxTurns?: number;
  maxOutputTokens?: number;
  /** Compaction threshold (estimated tokens). Default 100k. */
  contextBudget?: number;
}

export interface AgentResult {
  /** Full history including the new turn; pass it back in for the next prompt. */
  messages: Message[];
  /** Concatenated text of the final assistant message. */
  text: string;
  stopReason: "end_turn" | "max_turns" | "blocked";
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; content: string; isError: boolean }
  | { type: "compacted"; before: number; after: number };
