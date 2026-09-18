import type { Result } from "@cortex/shared";

/** Execution context passed to every tool handler. */
export interface ToolExecutionContext {
  cwd: string;
  signal?: AbortSignal;
}

/** A single tool that can be executed. */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  handler(args: TArgs, context: ToolExecutionContext): Promise<Result<TResult>>;
}
