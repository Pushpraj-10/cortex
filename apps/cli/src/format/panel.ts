/**
 * Fitting a row of styled text to a width. The menus and prompts drawn over the transcript fill every row out to the full
 * terminal width with a background, so each row has to be exactly as wide as it says: too long and Ink would cut it its
 * own way, too short and the background would stop early. Pure, so it can be tested without a terminal.
 */
import { displayWidth } from "./table.js";

/** A run of text in one style; a row is a list of these. */
export interface Piece {
  text: string;
  color?: string;
  bold?: boolean;
}

const ELLIPSIS = "…";

/** `text` cut to at most `max` columns, ending in an ellipsis (or starting with one, when `from` is "start"). Always cuts: call it only when it does not fit. */
export function ellipsize(text: string, max: number, from: "end" | "start" = "end"): string {
  if (max <= 0) return "";
  const characters = Array.from(text);
  if (from === "start") characters.reverse();
  const kept: string[] = [];
  let used = 0;
  for (const character of characters) {
    const width = displayWidth(character);
    if (used + width > max - 1) break;
    kept.push(character);
    used += width;
  }
  if (from === "start") kept.reverse();
  return from === "start" ? ELLIPSIS + kept.join("") : kept.join("") + ELLIPSIS;
}

/** Columns a row of pieces takes. */
export const piecesWidth = (pieces: Piece[]): number => pieces.reduce((sum, piece) => sum + displayWidth(piece.text), 0);

/**
 * The pieces cut to fit `width` columns, or unchanged when they already do. Cutting from the "end" keeps the beginning of
 * the row and drops the rest after an ellipsis; from the "start" it cuts the front of the last piece instead, so the end of
 * a path (its file name) survives, and falls back to cutting the end when even that leaves no room.
 */
export function fitPieces(pieces: Piece[], width: number, from: "end" | "start" = "end"): Piece[] {
  if (piecesWidth(pieces) <= width) return pieces;
  if (width <= 0) return [];

  if (from === "start" && pieces.length > 0) {
    const last = pieces[pieces.length - 1]!;
    const room = width - piecesWidth(pieces.slice(0, -1));
    if (room >= 2) return [...pieces.slice(0, -1), { ...last, text: ellipsize(last.text, room, "start") }];
  }

  const kept: Piece[] = [];
  let used = 0;
  for (const piece of pieces) {
    const pieceWidth = displayWidth(piece.text);
    // Everything before the cut must leave one column for the ellipsis.
    if (used + pieceWidth <= width - 1) {
      kept.push(piece);
      used += pieceWidth;
      continue;
    }
    kept.push({ ...piece, text: ellipsize(piece.text, width - used) });
    break;
  }
  return kept;
}
