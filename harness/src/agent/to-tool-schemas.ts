import type { ToolSchema } from "../llm/types";
import type { ToolDef } from "../tools/types";

/** The agent is the layer that bridges tools and the model, so the translation lives here. */
export function toToolSchemas(tools: ToolDef[]): ToolSchema[] {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}
