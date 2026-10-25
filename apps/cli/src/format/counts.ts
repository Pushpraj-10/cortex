/** Numbers shown while the model works: a rough token count for the text written so far, in a short form (`340`, `1.2k`, `12k`). */

/** About four characters to a token: close enough for a live indicator, and the same rule the agent uses to decide when to compact. */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(Math.max(0, Math.round(tokens)));
  if (tokens < 10_000) {
    const tenths = Math.round(tokens / 100);
    return tenths >= 100 ? "10k" : `${(tenths / 10).toFixed(1)}k`;
  }
  if (tokens < 999_500) return `${Math.round(tokens / 1000)}k`;
  return `${(Math.round(tokens / 100_000) / 10).toFixed(1)}M`;
}
