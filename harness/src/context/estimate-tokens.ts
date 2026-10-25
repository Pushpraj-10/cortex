import type { Message } from "../llm/types";

/** Rough heuristic: ~4 characters per token. Good enough to trigger compaction. */
export function estimateTokens(messages: Message[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}
