import { builtinTools, registerTool } from "@cortex/tools";

/** Registers every tool @cortex/tools ships. Call once, at startup. */
export function registerFileSystemTools(): void {
  for (const tool of builtinTools) registerTool(tool);
}
