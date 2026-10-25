import type { ContextFragment } from "../types.js";

const TRUNCATION_MARKER = "\n[truncated]";
/** Per-fragment rendering overhead: "## ", the newline after the title, and the blank line between sections. */
const FRAGMENT_OVERHEAD = 6;
/** A truncated fragment is only worth keeping if at least this much of its content survives. */
const MIN_USEFUL_CONTENT = 80;

/**
 * Keeps fragments, in the order given, until `maxChars` is used up. The fragment that
 * crosses the line is truncated (if enough of it fits to be useful); everything after
 * it is dropped, so a lower-ranked fragment never jumps ahead of a higher-ranked one.
 * When anything was dropped a short note says so, so the model knows the list is partial.
 */
export function applyBudget(fragments: ContextFragment[], maxChars: number): ContextFragment[] {
  const kept: ContextFragment[] = [];
  let remaining = maxChars;
  let omitted = 0;

  for (const fragment of fragments) {
    if (remaining <= 0) {
      omitted += 1;
      continue;
    }

    const cost = fragment.title.length + fragment.content.length + FRAGMENT_OVERHEAD;
    if (cost <= remaining) {
      kept.push(fragment);
      remaining -= cost;
      continue;
    }

    const room = remaining - fragment.title.length - FRAGMENT_OVERHEAD - TRUNCATION_MARKER.length;
    if (room >= MIN_USEFUL_CONTENT) {
      kept.push({ ...fragment, content: fragment.content.slice(0, room) + TRUNCATION_MARKER });
    } else {
      omitted += 1;
    }
    remaining = 0;
  }

  if (omitted > 0) {
    kept.push({
      providerId: "context",
      title: "Omitted context",
      content: `${omitted} lower-priority context section(s) were left out to stay within the size budget.`,
    });
  }

  return kept;
}
