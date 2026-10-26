/**
 * Pure helpers for the emblem (the braille picture in emblem-art.ts): deciding how much of the header a
 * terminal has room for, and which picture goes with it.
 */
import { EMBLEM_LARGE, EMBLEM_MEDIUM, type EmblemArt } from "./emblem-art.js";

/** `large` and `medium` show the emblem beside the wordmark; `compact` is the wordmark alone. */
export type HeaderLayout = "large" | "medium" | "compact";

/** Columns between the emblem and the text beside it. */
export const EMBLEM_GAP = 3;

/** The emblem needs height as well as width: it is 7 rows tall at its largest, and must leave room for the conversation. */
export function chooseHeaderLayout(columns: number, rows: number): HeaderLayout {
  if (columns >= 78 && rows >= 32) return "large";
  if (columns >= 56 && rows >= 22) return "medium";
  return "compact";
}

export function emblemFor(layout: Exclude<HeaderLayout, "compact">): EmblemArt {
  return layout === "large" ? EMBLEM_LARGE : EMBLEM_MEDIUM;
}

// ---- Colouring the dots ----

/** Which theme colour a stretch of the emblem is drawn in: the logo's red (the theme's primary), or its dark panel. */
export type EmblemTone = "primary" | "panel";

/** A run of neighbouring cells of one tone, drawn as one piece of text; `tone` is absent for the blank cells around the shape. */
export interface EmblemRun {
  text: string;
  tone?: EmblemTone;
}

const TONES: Record<string, EmblemTone | undefined> = { R: "primary", P: "panel" };

/** The emblem as lines of runs, so that it is a few dozen pieces of text rather than hundreds, one per cell. */
export function emblemRuns(art: EmblemArt): EmblemRun[][] {
  return art.rows.map((row, index) => {
    const tones = art.tones[index] ?? "";
    const runs: EmblemRun[] = [];
    for (const [column, char] of [...row].entries()) {
      const tone = char === " " ? undefined : TONES[tones[column] ?? ""];
      const last = runs[runs.length - 1];
      if (last && last.tone === tone) last.text += char;
      else runs.push({ text: char, tone });
    }
    return runs;
  });
}
