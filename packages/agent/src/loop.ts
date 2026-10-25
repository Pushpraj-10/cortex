import type { ChatMessage, LLMProvider, ToolSpec } from "@cortex/providers";
import { compactHistory } from "./compaction.js";
import { REFUSAL_CODES, type AgentEvent, type Executor } from "./types.js";

// 8 proved too tight in real sessions: a find → read → edit → verify task can spend
// several turns just recovering from one wrong guess (a bad path, a rejected edit).
const DEFAULT_MAX_ITERATIONS = 16;

const DEFAULT_CONTEXT_BUDGET_TOKENS = 100_000;

/** One runaway tool result must not consume the whole context budget. */
const MAX_TOOL_RESULT_CHARS = 30_000;

/** Prefix of the message yielded when the model request itself fails; UIs classify on it. */
export const LLM_ERROR_PREFIX = "LLM request failed: ";

export interface ToolLoopDeps {
  llm: LLMProvider;
  executor: Executor;
  tools: ToolSpec[];
  maxIterations?: number;
  /** Estimated-token size of the history above which older turns are summarized. Defaults to 100,000. */
  contextBudgetTokens?: number;
  /**
   * Rendered context (from @cortex/context's gatherContext), appended as a trailing
   * `user` message on every request. Never pushed into `history` itself — appending
   * it there would leave a trail of stale, increasingly contradictory copies as a
   * session goes on. Keeping exactly one, freshly computed, at the end also puts it
   * where a small model actually attends.
   */
  contextBlock?: string;
}

function truncate(text: string): string {
  return text.length <= MAX_TOOL_RESULT_CHARS ? text : `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[output truncated at ${MAX_TOOL_RESULT_CHARS} characters]`;
}

/**
 * The one tool-use loop behind AgentSession.chat: ask the model for one action, run
 * it if it called a tool, feed the result back, repeat until the model responds with
 * plain text or maxIterations is hit. `history` is mutated in place so the caller
 * keeps the full conversation after the loop ends. Before each request the history is
 * compacted if it has outgrown the context budget.
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
    const compaction = await compactHistory(history, {
      llm: deps.llm,
      maxTokens: deps.contextBudgetTokens ?? DEFAULT_CONTEXT_BUDGET_TOKENS,
      signal,
    });
    if (compaction) yield { type: "compacted", ...compaction };

    const requestMessages = deps.contextBlock
      ? [...history, { role: "user" as const, content: deps.contextBlock }]
      : history;
    const result = await deps.llm.chat({ messages: requestMessages, tools: deps.tools, signal });

    if (!result.ok) {
      yield { type: "message", content: `${LLM_ERROR_PREFIX}${result.error.message}` };
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
    const refused = !output.ok && (REFUSAL_CODES as readonly string[]).includes((output.error as { code?: string }).code ?? "");
    yield { type: "toolResult", toolName: call.toolName, output: toolResultContent, ok: output.ok, ...(refused ? { refused: true as const } : {}) };

    history.push({ role: "tool", name: call.toolName, content: truncate(JSON.stringify(toolResultContent)) });
  }

  yield { type: "message", content: `Stopped after ${maxIterations} turns without a final answer.` };
}
