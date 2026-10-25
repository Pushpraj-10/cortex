import { runAgent } from "../agent/run-agent";
import type { AgentOptions } from "../agent/types";
import type { ToolDef } from "../tools/types";

/**
 * Subagent: runs the same loop on a fresh history with the same tools minus `Task` (no recursion).
 * Only its final text returns to the parent, so exploration noise stays out of the parent's context.
 */
export function createTaskTool(parent: AgentOptions): ToolDef {
  return {
    name: "Task",
    description:
      "Delegate a self-contained job (research, search, multi-step investigation) to a subagent with its own context. Returns only its final answer.",
    readOnly: false,
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "3-5 word label" },
        prompt: { type: "string", description: "Complete instructions; the subagent sees nothing else" },
      },
      required: ["description", "prompt"],
    },
    async run(input) {
      const result = await runAgent([], String(input.prompt), {
        ...parent,
        tools: parent.tools.filter((t) => t.name !== "Task"),
        onEvent: undefined,
        maxTurns: 25,
      });
      return result.text || "(subagent produced no text)";
    },
  };
}
