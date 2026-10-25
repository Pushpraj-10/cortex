/**
 * Pure helpers for the emblem (the braille picture in emblem-art.ts): grouping its cells into colour runs,
 * and deciding how much of the header a terminal has room for.
 */
import { EMBLEM_LARGE, EMBLEM_MEDIUM, type EmblemArt } from "./emblem-art.js";

export interface EmblemRun {
  text: string;
  /** 0 (the logo's green end) to 9 (its cyan end); undefined for empty cells. */
  tone?: number;
}

/** Each row as runs of neighbouring cells with the same tone, so a row is a few <Text>s and not one per cell. */
export function emblemRuns(art: EmblemArt): EmblemRun[][] {
  return art.rows.map((row, y) => {
    const tones = art.tones[y] ?? "";
    const runs: EmblemRun[] = [];
    for (let x = 0; x < row.length; x += 1) {
      const digit = tones[x];
      const tone = digit !== undefined && digit >= "0" && digit <= "9" ? Number(digit) : undefined;
      const previous = runs[runs.length - 1];
      if (previous && previous.tone === tone) previous.text += row[x];
      else runs.push(tone === undefined ? { text: row[x]! } : { text: row[x]!, tone });
    }
    return runs;
  });
}

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
