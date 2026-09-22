import type { ToolSpec } from "../../types.js";

export interface GroqToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** Maps our provider-agnostic ToolSpec[] to Groq's (OpenAI-compatible) function-calling tool schema. */
export function toGroqTools(tools: ToolSpec[]): GroqToolSpec[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parametersSchema },
  }));
}
