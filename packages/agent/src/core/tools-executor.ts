import { getTool } from "@cortex/tools";
import type { Result } from "@cortex/shared";
import type { Executor } from "../types.js";

/** Executor backed directly by @cortex/tools' registry — looks up and runs a tool by name. */
export function createToolsExecutor(cwd: string): Executor {
  return {
    async execute(toolName: string, args: unknown): Promise<Result<unknown>> {
      const tool = getTool(toolName);
      return tool.handler(args, { cwd });
    },
  };
}
