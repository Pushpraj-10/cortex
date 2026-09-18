import type { ToolSpec } from "@cortex/llm";
import type { ToolDefinition } from "@cortex/tools";

/**
 * Maps a registered @cortex/tools definition to the ToolSpec shape @cortex/llm's
 * native tool-calling contract expects. ToolDefinition.parametersSchema is already
 * real JSON Schema, so this is a plain field rename, not new schema work.
 */
export function toToolSpec(tool: ToolDefinition): ToolSpec {
  return { name: tool.name, description: tool.description, parametersSchema: tool.parametersSchema };
}
