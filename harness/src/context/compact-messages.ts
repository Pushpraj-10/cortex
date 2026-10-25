import type { LlmProvider, Message } from "../llm/types";
import { estimateTokens } from "./estimate-tokens";
import { isTurnStart } from "./is-turn-start";

const SUMMARY_PROMPT =
  "Summarize the conversation so far so work can continue from the summary alone. Keep: the user's goal, decisions made, " +
  "files touched, current state, and open TODOs. Be concise and factual.";

export interface CompactOptions {
  provider: LlmProvider;
  /** Compact when the estimate exceeds this. */
  maxTokens: number;
  /** Minimum number of recent messages to keep verbatim. */
  keepRecent?: number;
}

/**
 * Replaces older history with an LLM summary once the estimate crosses `maxTokens`.
 * The kept tail always begins at a user turn so tool_use/tool_result pairs are never split.
 * Returns the same array if no compaction was needed or possible.
 */
export async function compactMessages(messages: Message[], opts: CompactOptions): Promise<Message[]> {
  if (estimateTokens(messages) <= opts.maxTokens) return messages;

  const keep = opts.keepRecent ?? 6;
  let cut = messages.length - keep;
  while (cut > 0 && !isTurnStart(messages[cut]!)) cut--;
  if (cut <= 0) return messages;

  const res = await opts.provider.complete({
    system: SUMMARY_PROMPT,
    messages: [...messages.slice(0, cut), { role: "user", content: "Write the summary now." }],
    tools: [],
    maxTokens: 2000,
  });
  const summary = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");

  return [{ role: "user", content: `[Summary of earlier conversation]\n${summary}` }, ...messages.slice(cut)];
}
