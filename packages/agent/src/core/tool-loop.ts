import type { ChatMessage, LLMProvider, ToolSpec } from "@cortex/llm";
import type { AgentEvent, Executor } from "../types.js";

// 8 proved too tight in real sessions: a find → read → edit → verify task can spend
// several turns just recovering from one wrong guess (a bad path, a rejected edit).
const DEFAULT_MAX_ITERATIONS = 16;

export interface ToolLoopDeps {
  llm: LLMProvider;
  executor: Executor;
  tools: ToolSpec[];
  maxIterations?: number;
  /**
   * Rendered context (from @cortex/context's gatherContext), appended as a trailing
   * `user` message on every request. Never pushed into `history` itself — appending
   * it there would leave a trail of stale, increasingly contradictory copies as a
   * session goes on. Keeping exactly one, freshly computed, at the end also puts it
   * where a small model actually attends.
   */
  contextBlock?: string;
}

/**
 * The one tool-use loop behind AgentSession.chat: ask the model for one action, run
 * it if it called a tool, feed the result back, repeat until the model responds with
 * plain text or maxIterations is hit. `history` is mutated in place so the caller
 * keeps the full conversation after the loop ends.
 *
 * Tool calls are native, not JSON-in-text: every tool offered to the model is a
 * ToolSpec, and the model's response carries structured toolCalls when it wants to
 * invoke one, or plain content when it's giving its final answer.
 */
export async function* runToolLoop(
  history: ChatMessage[],
  deps: ToolLoopDeps,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent, void, void> {
  const maxIterations = deps.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const requestMessages = deps.contextBlock
      ? [...history, { role: "user" as const, content: deps.contextBlock }]
      : history;
    const result = await deps.llm.chat({ messages: requestMessages, tools: deps.tools, signal });

    if (!result.ok) {
      yield { type: "message", content: `LLM request failed: ${result.error.message}` };
      return;
    }

    // Pushed as-is, toolCalls included: Ollama expects a replayed conversation to
    // carry the earlier assistant turn's tool_calls, not just the result that follows.
    history.push(result.value);

    const call = result.value.toolCalls?.[0];
    if (!call) {
      yield { type: "message", content: result.value.content };
      return;
    }

    // Only the first call is run, even if the model asked for several at once — one
    // action per turn, so the model sees its real result before deciding the next one.
    yield { type: "toolCall", toolName: call.toolName, args: call.args };

    const output = await deps.executor.execute(call.toolName, call.args, signal);
    const toolResultContent = output.ok ? output.value : { error: output.error.message };
    yield { type: "toolResult", toolName: call.toolName, output: toolResultContent };

    history.push({ role: "tool", name: call.toolName, content: JSON.stringify(toolResultContent) });
  }

  yield { type: "message", content: `Stopped after ${maxIterations} turns without a final answer.` };
}
