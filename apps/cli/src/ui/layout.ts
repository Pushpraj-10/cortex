/**
 * Vertical layout of the full-screen view. The transcript takes whatever rows the fixed-height
 * pieces below it leave, so those heights are computed in one place instead of being scattered
 * through the component. A bordered box costs 2 extra rows (top and bottom border).
 */
import { maxInputBoxLines } from "./theme.js";

const BORDER_ROWS = 2;
const STATUS_LINE_ROWS = 1;
const THINKING_ROWS = 1;
const MIN_TRANSCRIPT_ROWS = 3;

/** Rows of text shown in the input box: one per line typed, capped. */
export function inputTextRows(value: string): number {
  return Math.min(Math.max(1, value.split("\n").length), maxInputBoxLines);
}

/** Rows the slash-command menu occupies: one per match (or one "no matches" row), plus borders; 0 when closed. */
export function slashMenuRows(open: boolean, matchCount: number): number {
  return open ? Math.max(1, matchCount) + BORDER_ROWS : 0;
}

export interface LayoutInput {
  rows: number;
  inputValue: string;
  thinking: boolean;
  slashMenuRows: number;
  /** Rows of the permission prompt, or 0 when none is showing. */
  promptRows: number;
}

/** Rows left for the transcript. Never fewer than 3, so it stays usable on a tiny terminal. */
export function transcriptRows(input: LayoutInput): number {
  const reserved =
    inputTextRows(input.inputValue) +
    BORDER_ROWS +
    (input.thinking ? THINKING_ROWS : 0) +
    input.slashMenuRows +
    input.promptRows +
    STATUS_LINE_ROWS;
  return Math.max(MIN_TRANSCRIPT_ROWS, input.rows - reserved);
}
