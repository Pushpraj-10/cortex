/**
 * The CORTEX wordmark as a tiny bitmap font, packed into text with half-block characters. Each text
 * cell holds two stacked pixels (`▀` top, `▄` bottom, `█` both), so a 7-pixel-tall letter takes 4 text
 * rows and the pixels are close to square: a crisp wordmark about 35 columns wide, instead of
 * box-drawing letters that spend 5 rows and 51 columns on far coarser shapes.
 *
 * Everything here is pure; colouring happens in Logo.tsx.
 */

const GLYPH_HEIGHT = 7;

/** 5x7 glyphs, `#` is a lit pixel. */
const GLYPHS: Record<string, string[]> = {
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
};

export const WORDMARK = "CORTEX";

/** The word as one bitmap, `#` lit and `.` dark, with `gap` dark columns between letters. */
export function wordBitmap(word: string, gap = 1): string[] {
  const separator = ".".repeat(gap);
  return Array.from({ length: GLYPH_HEIGHT }, (_, row) =>
    [...word].map((letter) => (GLYPHS[letter] ?? GLYPHS["X"]!)[row]!).join(separator),
  );
}

/** Packs pairs of bitmap rows into text rows with half-blocks; an odd last row pairs with a dark one. */
export function packHalfBlocks(bitmap: string[]): string[] {
  const rows: string[] = [];
  for (let top = 0; top < bitmap.length; top += 2) {
    const upper = bitmap[top] ?? "";
    const lower = bitmap[top + 1] ?? "";
    const width = Math.max(upper.length, lower.length);
    let line = "";
    for (let column = 0; column < width; column += 1) {
      const up = upper[column] === "#";
      const down = lower[column] === "#";
      line += up && down ? "█" : up ? "▀" : down ? "▄" : " ";
    }
    rows.push(line);
  }
  return rows;
}

export type LogoVariant = "full" | "spaced" | "plain";

export interface LogoArt {
  variant: LogoVariant;
  rows: string[];
  /** Columns the widest row takes. */
  width: number;
}

const FULL_ROWS = packHalfBlocks(wordBitmap(WORDMARK));

const ARTS: Record<LogoVariant, string[]> = {
  full: FULL_ROWS,
  spaced: [[...WORDMARK].join(" ")],
  plain: [WORDMARK],
};

/** The biggest variant that fits in `columns`; the plain word is the floor, however narrow the terminal. */
export function chooseLogo(columns: number): LogoArt {
  const variant: LogoVariant =
    columns >= widthOf(ARTS.full) ? "full" : columns >= widthOf(ARTS.spaced) ? "spaced" : "plain";
  return { variant, rows: ARTS[variant], width: widthOf(ARTS[variant]) };
}

function widthOf(rows: string[]): number {
  return Math.max(...rows.map((row) => row.length));
}
