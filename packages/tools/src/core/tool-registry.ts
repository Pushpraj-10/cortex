import { CortexError } from "@cortex/shared";
import type { ToolDefinition } from "../types.js";

export class UnknownToolError extends CortexError {
  constructor(name: string) {
    super(`Tool "${name}" is not registered`, "TOOL_UNKNOWN");
  }
}

/** Maps tool name → definition. */
const registry = new Map<string, ToolDefinition>();

/**
 * Register a tool so it can be looked up by name.
 * Call this in the composition root to make a tool available.
 */
export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.name, tool);
}

/**
 * Retrieve a registered tool by name.
 * Throws UnknownToolError if the tool is not registered.
 */
export function getTool(name: string): ToolDefinition {
  const tool = registry.get(name);
  if (!tool) {
    throw new UnknownToolError(name);
  }
  return tool;
}

/** List all registered tools. */
export function listTools(): ToolDefinition[] {
  return Array.from(registry.values());
}
