import type { ToolSpec } from "../../types.js";

export interface OllamaToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Maps our provider-agnostic ToolSpec[] to Ollama's function-calling tool schema. */
export function toOllamaTools(tools: ToolSpec[]): OllamaToolSpec[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parametersSchema },
  }));
}
