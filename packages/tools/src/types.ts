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

/**
 * What a call is about to do, for showing to the user before it runs and while it does.
 * - `diff`: a change to one file. `before` and `after` hold the affected lines plus a little context, and `startLine`
 *   is the 1-based line number of the first of them. `before` is "" for a file that does not exist yet.
 * - `command`: a command about to run.
 */
export type ToolPreview =
  | { kind: "diff"; path: string; before: string; after: string; startLine: number; isNew?: boolean }
  | { kind: "command"; command: string };

/** A single tool that can be executed. */
export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  kind: ToolKind;
  /** One-line, human-readable description of a call, e.g. "Read src/a.ts". UIs use it instead of knowing tool names. */
  summarize?(args: TArgs): string;
  /**
   * Describes what a call would change without changing anything, so a UI can show it before the user approves.
   * Optional. It runs before the tool does, so it must tolerate bad arguments: return undefined rather than throw.
   */
  preview?(args: TArgs, context: ToolExecutionContext): Promise<ToolPreview | undefined>;
  handler(args: TArgs, context: ToolExecutionContext): Promise<Result<TResult>>;
}
