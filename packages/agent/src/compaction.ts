/**
 * Context compaction: when the conversation outgrows its budget, older turns are replaced by a
 * summary the model writes, so a long session can continue instead of failing on context length.
 * The system message and the most recent turns are always kept verbatim.
 */
import type { ChatMessage, LLMProvider } from "@cortex/providers";

const SUMMARY_PROMPT =
  "Summarize the conversation so far so work can continue from the summary alone. Keep: the user's goal, " +
  "decisions made, files touched, current state, and open TODOs. Be concise and factual.";

const DEFAULT_KEEP_RECENT = 6;

/** Rough heuristic: about 4 characters per token. Good enough to decide when to compact. */
export function estimateTokens(messages: ChatMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

export interface CompactOptions {
  llm: LLMProvider;
  /** Compact only when the estimate exceeds this. */
  maxTokens: number;
  /** Minimum number of recent messages to keep verbatim. Defaults to 6. */
  keepRecent?: number;
  signal?: AbortSignal;
}

/**
 * Replaces older history with a summary, in place, once the estimate crosses `maxTokens`. The kept tail
 * always begins at a user message, so an assistant tool call is never separated from its tool result.
 * Returns the estimated size before and after, or null if nothing was compacted (under budget, nothing
 * safe to cut, or the summary request failed — compaction is best-effort and never fails a turn).
 */
export async function compactHistory(
  history: ChatMessage[],
  options: CompactOptions,
): Promise<{ before: number; after: number } | null> {
  const before = estimateTokens(history);
  if (before <= options.maxTokens) return null;

  const start = history[0]?.role === "system" ? 1 : 0;
  let cut = history.length - (options.keepRecent ?? DEFAULT_KEEP_RECENT);
  while (cut > start && history[cut]?.role !== "user") cut -= 1;
  if (cut <= start) return null;

  const reply = await options.llm.chat({
    messages: [
      { role: "system", content: SUMMARY_PROMPT },
      ...history.slice(start, cut),
      { role: "user", content: "Write the summary now." },
    ],
    signal: options.signal,
  });
  if (!reply.ok) return null;

  history.splice(start, cut - start, { role: "user", content: `[Summary of earlier conversation]\n${reply.value.content}` });
  return { before, after: estimateTokens(history) };
}
