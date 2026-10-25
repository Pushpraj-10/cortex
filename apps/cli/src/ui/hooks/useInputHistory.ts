import { useState } from "react";

export interface InputHistory {
  /** Move one entry back in history. Pass the current draft so it can be restored on `down()`. */
  up(currentValue: string): string;
  /** Move one entry forward in history, or back to the draft once past the newest entry. */
  down(): string;
  /** Leave history-browsing mode (called after a message is submitted). */
  reset(): void;
}

/** Cycles a text input through a fixed history array, like a shell's up/down arrow recall. */
export function useInputHistory(history: string[]): InputHistory {
  const [index, setIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  function up(currentValue: string): string {
    if (history.length === 0) return currentValue;

    if (index === null) {
      setDraft(currentValue);
      const newIndex = history.length - 1;
      setIndex(newIndex);
      return history[newIndex]!;
    }

    const newIndex = Math.max(0, index - 1);
    setIndex(newIndex);
    return history[newIndex]!;
  }

  function down(): string {
    if (index === null) return "";

    if (index >= history.length - 1) {
      setIndex(null);
      return draft;
    }

    const newIndex = index + 1;
    setIndex(newIndex);
    return history[newIndex]!;
  }

  function reset(): void {
    setIndex(null);
    setDraft("");
  }

  return { up, down, reset };
}

// ---- Reverse search (ctrl+r) ----

/** The messages containing `query` (ignoring case), newest first, each only once. An empty query matches them all. */
export function historyMatches(entries: readonly string[], query: string): string[] {
  const needle = query.toLowerCase();
  const seen = new Set<string>();
  const matches: string[] = [];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]!;
    if (seen.has(entry) || !entry.toLowerCase().includes(needle)) continue;
    seen.add(entry);
    matches.push(entry);
  }
  return matches;
}

export interface HistorySearch {
  query: string;
  /** Which match is shown: 0 is the newest. */
  index: number;
}

/** The parts of Ink's `Key` the search looks at. */
export interface SearchKey {
  ctrl: boolean;
  meta: boolean;
  return: boolean;
  escape: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
}

export type SearchOutcome = "accept" | "cancel";

/**
 * One key press while searching. Typing narrows the query (and goes back to the newest match); ctrl+r or up goes to an older
 * match, down to a newer one; backspace shortens the query. Enter, tab or a sideways arrow takes the shown match into the
 * input box to edit (it is never sent from here); escape gives up. `matchCount` keeps the index in range.
 */
export function stepHistorySearch(
  search: HistorySearch,
  typed: string,
  key: SearchKey,
  matchCount: number,
): { search: HistorySearch; outcome?: SearchOutcome } {
  if (key.escape) return { search, outcome: "cancel" };
  if (key.return || key.tab || key.leftArrow || key.rightArrow) return { search, outcome: "accept" };

  const older = (key.ctrl && typed === "r") || key.upArrow;
  if (older) return { search: { ...search, index: Math.min(search.index + 1, Math.max(0, matchCount - 1)) } };
  if (key.downArrow) return { search: { ...search, index: Math.max(0, search.index - 1) } };

  if (key.backspace || key.delete) return { search: { query: search.query.slice(0, -1), index: 0 } };

  if (key.ctrl || key.meta) return { search };
  const text = typed.replace(/[\u0000-\u001f\u007f]/g, "");
  return text ? { search: { query: search.query + text, index: 0 } } : { search };
}
