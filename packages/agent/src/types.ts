import type { Result } from "@cortex/shared";
import type { LLMProvider } from "@cortex/llm";

/** Runs a single tool call by name. Wraps whatever tool-running strategy the composition root wires in. */
export interface Executor {
  execute(toolName: string, args: unknown): Promise<Result<unknown>>;
}

export type AgentEvent =
  | { type: "message"; content: string }
  | { type: "toolCall"; toolName: string; args: unknown }
  | { type: "toolResult"; toolName: string; output: unknown };

export interface AgentConfig {
  llm: LLMProvider;
  executor: Executor;
  workspaceRoot: string;
  /** Defaults to 16. Caps how many model/tool round-trips a single chat() call may take. */
  maxIterations?: number;
}

export interface AgentSession {
  chat(userInput: string): AsyncGenerator<AgentEvent, void, void>;
}
