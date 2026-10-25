import type { Result } from "@cortex/core";

/** Execution context passed to every tool handler. */
export interface ToolExecutionContext {
  cwd: string;
  signal?: AbortSignal;
}

/**
 * What a tool does to the world, which is what an approval policy cares about:
 * - `read`: only inspects (safe to run without asking, allowed in plan mode)
 * - `edit`: changes files inside the workspace
 * - `execute`: runs arbitrary commands, so it can do anything
 */
export type ToolKind = "read" | "edit" | "execute";

/** A single tool that can be executed. */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  kind: ToolKind;
  /** One-line, human-readable description of a call, e.g. "Read src/a.ts". UIs use it instead of knowing tool names. */
  summarize?(args: TArgs): string;
  handler(args: TArgs, context: ToolExecutionContext): Promise<Result<TResult>>;
}
