import type { ContextFragment } from "../types.js";

/** Orders fragments by `relevance`, highest first; fragments with equal relevance keep their incoming order. */
export function rankFragments(fragments: ContextFragment[]): ContextFragment[] {
  return [...fragments].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
