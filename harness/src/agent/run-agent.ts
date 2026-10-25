import { compactMessages } from "../context/compact-messages";
import { estimateTokens } from "../context/estimate-tokens";
import { runHooks } from "../hooks/run-hooks";
import type { Message, ToolResultBlock } from "../llm/types";
import { executeToolCall } from "./execute-tool-call";
import { toToolSchemas } from "./to-tool-schemas";
import type { AgentOptions, AgentResult } from "./types";

/**
 * The agent loop: call the model; if it asks for tools, run them and feed the results back; stop when it replies with text only.
 * The model drives the loop. Nothing here knows about "stages".
 */
export async function runAgent(history: Message[], prompt: string, opts: AgentOptions): Promise<AgentResult> {
  const onEvent = opts.onEvent ?? (() => {});
  const maxTurns = opts.maxTurns ?? 50;

  const submit = await runHooks(opts.hooks, "UserPromptSubmit", { prompt }, opts.cwd);
  if (submit.blocked) return { messages: history, text: submit.message, stopReason: "blocked" };

  let messages: Message[] = [...history, { role: "user", content: prompt }];
  const schemas = toToolSchemas(opts.tools);
  let text = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const before = estimateTokens(messages);
    const compacted = await compactMessages(messages, {
      provider: opts.provider,
      maxTokens: opts.contextBudget ?? 100_000,
    });
    if (compacted !== messages) {
      messages = compacted;
      onEvent({ type: "compacted", before, after: estimateTokens(messages) });
    }

    const res = await opts.provider.complete({
      system: opts.system,
      messages,
      tools: schemas,
      maxTokens: opts.maxOutputTokens ?? 8192,
    });
    messages = [...messages, { role: "assistant", content: res.content }];

    text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    if (text) onEvent({ type: "text", text });

    const uses = res.content.flatMap((b) => (b.type === "tool_use" ? [b] : []));
    if (uses.length === 0) {
      await runHooks(opts.hooks, "Stop", {}, opts.cwd);
      return { messages, text, stopReason: "end_turn" };
    }

    const results: ToolResultBlock[] = [];
    for (const use of uses) results.push(await executeToolCall(use, { ...opts, onEvent }));
    messages = [...messages, { role: "user", content: results }];
  }

  return { messages, text, stopReason: "max_turns" };
}
