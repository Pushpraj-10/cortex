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
