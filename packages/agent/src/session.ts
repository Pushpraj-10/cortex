import { gatherContext } from "@cortex/context";
import { runHooks } from "@cortex/policy";
import type { ChatMessage, ToolSpec } from "@cortex/providers";
import { listTools, type ToolDefinition } from "@cortex/tools";
import { runToolLoop } from "./loop.js";
import { isToolAllowed } from "./agent-modes.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type { AgentConfig, AgentEvent, AgentSession } from "./types.js";

/**
 * Maps a registered @cortex/tools definition to the ToolSpec shape @cortex/providers' native
 * tool-calling contract expects. parametersSchema is already real JSON Schema, so this is a plain
 * field rename, not new schema work.
 */
export function toToolSpec(tool: ToolDefinition): ToolSpec {
  return { name: tool.name, description: tool.description, parametersSchema: tool.parametersSchema };
}

/**
 * Creates a chat session for one workspace. Each chat() call appends the user's message and runs
 * the tool loop against the full conversation so far, so context carries across calls on the same
 * session. The system message is re-rendered per call (it is always history[0]) so a permission-mode
 * or agent-mode change takes effect on the next message.
 */
export function createAgentSession(config: AgentConfig): AgentSession {
  const excluded = new Set(config.excludeTools ?? []);
  const systemMessage = (): ChatMessage => ({
    role: "system",
    content: buildSystemPrompt({
      workspaceRoot: config.workspaceRoot,
      mode: config.policy?.mode,
      agent: config.policy?.agent,
      memory: config.memory,
      skillIndex: config.skillIndex,
    }),
  });
  const history: ChatMessage[] = [systemMessage()];

  return {
    async *chat(userInput: string, signal?: AbortSignal): AsyncGenerator<AgentEvent, void, void> {
      const policy = config.policy;
      if (policy) {
        const submit = await runHooks(policy.hooks, "UserPromptSubmit", { prompt: userInput }, config.workspaceRoot);
        if (submit.blocked) {
          yield { type: "message", content: submit.message };
          return;
        }
      }

      history[0] = systemMessage();
      history.push({ role: "user", content: userInput });
      const agent = policy?.agent;
      const tools = listTools()
        .filter((tool) => !excluded.has(tool.name) && isToolAllowed(agent, tool))
        .map(toToolSpec);
      const contextBlock = await gatherContext({ workspaceRoot: config.workspaceRoot, userMessage: userInput, signal });

      yield* runToolLoop(
        history,
        {
          llm: config.llm,
          executor: config.executor,
          tools,
          maxIterations: config.maxIterations,
          contextBudgetTokens: config.contextBudgetTokens,
          contextBlock: contextBlock || undefined,
        },
        signal,
      );

      if (policy) await runHooks(policy.hooks, "Stop", {}, config.workspaceRoot);
    },
  };
}
