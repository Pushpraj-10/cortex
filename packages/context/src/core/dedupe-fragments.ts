import type { ContextFragment } from "../types.js";

/** Drops fragments whose title and content exactly match an earlier one, keeping the first. */
export function dedupeFragments(fragments: ContextFragment[]): ContextFragment[] {
  const seen = new Set<string>();
  return fragments.filter((fragment) => {
    const key = `${fragment.title}\u0000${fragment.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
