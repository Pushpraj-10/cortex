import type { Result } from "@cortex/core";
import type { HookDef, PermissionMode, PermissionRules } from "@cortex/policy";
import type { LLMProvider } from "@cortex/providers";

/** Runs a single tool call by name. Wraps whatever tool-running strategy the composition root wires in. */
export interface Executor {
  execute(toolName: string, args: unknown, signal?: AbortSignal): Promise<Result<unknown>>;
}

export type AgentEvent =
  | { type: "message"; content: string }
  | { type: "toolCall"; toolName: string; args: unknown }
  | { type: "toolResult"; toolName: string; output: unknown }
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
