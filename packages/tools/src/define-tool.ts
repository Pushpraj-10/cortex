import { CortexError, err, ok } from "@cortex/core";
import type { ToolDefinition, ToolExecutionContext } from "./types.js";

/** Any failure while a tool runs: a bad path, a missing file, a rejected edit, a failed command. */
export class ToolError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "TOOL_FAILED", cause);
  }
}

/** Renders a tool argument for a summary line; "?" when it is missing or not a string. */
export function argText(value: unknown): string {
  return typeof value === "string" ? value : "?";
}

export interface DefineToolOptions<TArgs, TResult> extends Omit<ToolDefinition<TArgs, TResult>, "handler"> {
  /** Starts the error message if `run` throws, e.g. `Failed to read file at a.ts`. */
  failure(args: TArgs): string;
  /** The tool's work. Return the result; throw to fail. */
  run(args: TArgs, context: ToolExecutionContext): Promise<TResult>;
}

/**
 * Builds a ToolDefinition from a plain `run` function: whatever `run` returns becomes an ok
 * Result, and whatever it throws becomes a ToolError Result. This is the one place that
 * try/catch lives, so each tool stays a few lines of real logic.
 */
export function defineTool<TArgs, TResult>(options: DefineToolOptions<TArgs, TResult>): ToolDefinition<TArgs, TResult> {
  const { failure, run, ...definition } = options;
  return {
    ...definition,
    async handler(args, context) {
      try {
        return ok(await run(args, context));
      } catch (error) {
        return err(new ToolError(`${failure(args)}: ${error}`, error));
      }
    },
  };
}
