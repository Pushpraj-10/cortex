import type { Result } from "@cortex/core";
import type { HookDef, PermissionMode, PermissionRules } from "@cortex/policy";
import type { LLMProvider } from "@cortex/providers";

/** Error codes the executor uses when a call is refused by a decision rather than failing. */
export const REFUSAL_CODES = ["TOOL_DENIED", "TOOL_DECLINED", "TOOL_BLOCKED"] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** Runs a single tool call by name. Wraps whatever tool-running strategy the composition root wires in. */
export interface Executor {
  execute(toolName: string, args: unknown, signal?: AbortSignal): Promise<Result<unknown>>;
}

export type AgentEvent =
  | { type: "message"; content: string }
  /**
   * A piece of the reply the model is writing now, for showing it live. The same text then arrives whole in a `message`
   * event, so a consumer may ignore deltas entirely.
   */
  | { type: "messageDelta"; delta: string }
  | { type: "toolCall"; toolName: string; args: unknown }
  /**
   * `ok` is false when the call failed, and `refused` is true when the cause was a decision (the user declined, policy
   * denied it, or a hook blocked it) rather than the tool failing. `output` is what the model is told.
   */
  | { type: "toolResult"; toolName: string; output: unknown; ok: boolean; refused?: true }
  /** Older history was replaced by a summary to stay inside the context budget (sizes are estimated tokens). */
  | { type: "compacted"; before: number; after: number };

/**
 * What is allowed to happen during a turn. One object is shared by the executor (which gates each tool
 * call) and the session (which runs prompt hooks and tells the model the mode), so the UI can change
 * `mode` between turns and both see it.
 */
export interface AgentPolicy {
  mode: PermissionMode;
  rules: PermissionRules;
  hooks: HookDef[];
  /** Asked when policy says a call needs approval. Resolve true to run it. */
  askPermission(toolName: string, args: unknown): Promise<boolean>;
}

export interface AgentConfig {
  llm: LLMProvider;
  executor: Executor;
  workspaceRoot: string;
  /** Defaults to 16. Caps how many model/tool round-trips a single chat() call may take. */
  maxIterations?: number;
  /** Enables prompt/stop hooks and tells the model the current permission mode. */
  policy?: AgentPolicy;
  /** Contents of the user's CORTEX.md files, added to the system prompt. */
  memory?: string;
  /** One line per available skill, added to the system prompt. */
  skillIndex?: string;
  /** Estimated-token size of the history above which older turns are summarized. Defaults to 100,000. */
  contextBudgetTokens?: number;
  /** Names of registered tools to withhold from the model (a subagent must not delegate again). */
  excludeTools?: string[];
}

export interface AgentSession {
  chat(userInput: string, signal?: AbortSignal): AsyncGenerator<AgentEvent, void, void>;
}
