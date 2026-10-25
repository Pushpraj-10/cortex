export const MAX_RESULT_CHARS = 30_000;

/** Keeps one runaway tool result from consuming the context budget. */
export function truncateOutput(s: string, max = MAX_RESULT_CHARS): string {
  return s.length <= max ? s : `${s.slice(0, max)}\n[output truncated at ${max} chars]`;
}
