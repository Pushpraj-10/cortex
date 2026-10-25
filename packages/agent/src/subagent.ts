/**
 * Subagents: the `task` tool lets the model hand a self-contained job (research, a wide search, a
 * multi-step investigation) to a fresh session with its own history. Only the subagent's final answer
 * returns, so its exploration never fills the parent's context. The subagent runs through the same
 * executor, so every tool call it makes is still gated by the same policy.
 */
import { defineTool, type ToolDefinition } from "@cortex/tools";
import { createAgentSession } from "./session.js";
import type { AgentConfig } from "./types.js";

export const TASK_TOOL_NAME = "task";

/** Subagents get more room than a chat turn: they are for the long, wandering jobs. */
const DEFAULT_SUBAGENT_ITERATIONS = 25;

export type TaskToolDeps = Pick<AgentConfig, "llm" | "executor" | "workspaceRoot" | "maxIterations" | "contextBudgetTokens">;

export function createTaskTool(deps: TaskToolDeps): ToolDefinition<{ description: string; prompt: string }, { answer: string }> {
  return defineTool({
    name: TASK_TOOL_NAME,
    description:
      "Delegate a self-contained job (research, search, multi-step investigation) to a subagent with its own context. Returns only its final answer.",
    // Delegating is not itself an action: whatever the subagent does is gated call by call.
    kind: "read",
    parametersSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "A 3-5 word label for the job" },
        prompt: { type: "string", description: "Complete instructions; the subagent sees nothing else" },
      },
      required: ["description", "prompt"],
    },
    summarize: (args) => `Delegate: ${typeof args?.description === "string" ? args.description : "?"}`,
    failure: (args) => `Subagent "${args.description}" failed`,
    async run(args, context) {
      // No `task` tool for the subagent (no recursion) and no policy object: the shared executor already gates its calls.
      const session = createAgentSession({
        ...deps,
        maxIterations: deps.maxIterations ?? DEFAULT_SUBAGENT_ITERATIONS,
        excludeTools: [TASK_TOOL_NAME],
      });

      let answer = "";
      for await (const event of session.chat(args.prompt, context.signal)) {
        if (event.type === "message") answer = event.content;
      }
      return { answer: answer || "(the subagent produced no answer)" };
    },
  });
}
