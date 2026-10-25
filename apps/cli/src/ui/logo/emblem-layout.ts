/**
 * Pure helpers for the emblem (the braille picture in emblem-art.ts): deciding how much of the header a
 * terminal has room for, and which picture goes with it.
 */
import { EMBLEM_LARGE, EMBLEM_MEDIUM, type EmblemArt } from "./emblem-art.js";

/** `large` and `medium` show the emblem beside the wordmark; `compact` is the wordmark alone. */
export type HeaderLayout = "large" | "medium" | "compact";

/** Columns between the emblem and the text beside it. */
export const EMBLEM_GAP = 3;

/** The emblem needs height as well as width: it is 14 rows tall at its largest, and must leave room for the conversation. */
export function chooseHeaderLayout(columns: number, rows: number): HeaderLayout {
  if (columns >= 78 && rows >= 32) return "large";
  if (columns >= 56 && rows >= 22) return "medium";
  return "compact";
}

export function emblemFor(layout: Exclude<HeaderLayout, "compact">): EmblemArt {
  return layout === "large" ? EMBLEM_LARGE : EMBLEM_MEDIUM;
}
