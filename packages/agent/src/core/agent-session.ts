import { chatSystemTemplate } from "@cortex/prompts";
import { listTools } from "@cortex/tools";
import type { ChatMessage } from "@cortex/llm";
import type { AgentConfig, AgentEvent, AgentSession } from "../types.js";
import { runToolLoop } from "./tool-loop.js";
import { toToolSpec } from "./to-tool-spec.js";

/**
 * Creates a chat session for one workspace. The system prompt is rendered once, up
 * front; each chat() call appends the user's message and runs the tool loop against
 * the full conversation so far, so context carries across calls on the same session.
 */
export function createAgentSession(config: AgentConfig): AgentSession {
  const history: ChatMessage[] = [
    { role: "system", content: chatSystemTemplate.render({ workspaceRoot: config.workspaceRoot }) },
  ];

  return {
    async *chat(userInput: string): AsyncGenerator<AgentEvent, void, void> {
      history.push({ role: "user", content: userInput });
      const tools = listTools().map(toToolSpec);

      yield* runToolLoop(history, {
        llm: config.llm,
        executor: config.executor,
        tools,
        maxIterations: config.maxIterations,
      });
    },
  };
}
