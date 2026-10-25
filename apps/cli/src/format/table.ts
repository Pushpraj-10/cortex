/**
 * Table layout, as pure functions: how wide each column is for a given terminal width, how its cells
 * wrap, and the box-drawing lines around them. The Table component only colours what this returns.
 * Cell text is shown as plain text (markup removed), so widths are exact.
 */
import { plainText } from "./inline.js";
import type { Align } from "./markdown.js";

const ZERO_WIDTH: [number, number][] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x200b, 0x200f],
  [0x20d0, 0x20ff],
  [0x2060, 0x2060],
  [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff],
];

const DOUBLE_WIDTH: [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd],
];

const within = (ranges: [number, number][], codePoint: number) => ranges.some(([low, high]) => codePoint >= low && codePoint <= high);

function charWidth(char: string): number {
  const codePoint = char.codePointAt(0)!;
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (within(ZERO_WIDTH, codePoint)) return 0;
  return within(DOUBLE_WIDTH, codePoint) ? 2 : 1;
}

/** Columns a string takes in a terminal: wide characters (CJK, emoji) count 2, combining marks 0. */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}

/** Splits `text` after as many characters as fit in `width` columns (always at least one, so callers make progress). */
function splitAtWidth(text: string, width: number): [string, string] {
  let used = 0;
  let index = 0;
  for (const char of text) {
    const next = charWidth(char);
    if (used + next > width && index > 0) break;
    used += next;
    index += char.length;
  }
  return [text.slice(0, index), text.slice(index)];
}

/** Wraps `text` into lines of at most `width` columns, at spaces where it can and mid-word where it must. */
export function wrapText(text: string, width: number): string[] {
  if (displayWidth(text) <= width) return [text];
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    let remaining = word;
    while (displayWidth(remaining) > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      const [head, tail] = splitAtWidth(remaining, width);
      lines.push(head);
      remaining = tail;
    }
    const candidate = current ? `${current} ${remaining}` : remaining;
    if (displayWidth(candidate) <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = remaining;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines;
}

function pad(text: string, width: number, align: Align): string {
  const gap = Math.max(0, width - displayWidth(text));
  if (align === "right") return " ".repeat(gap) + text;
  if (align === "center") return " ".repeat(Math.floor(gap / 2)) + text + " ".repeat(Math.ceil(gap / 2));
  return text + " ".repeat(gap);
}

export type TableLine =
  | { kind: "border"; text: string }
  /** One entry per column, already padded to the column's width. */
  | { kind: "header" | "row"; cells: string[] };

export interface TableLayout {
  widths: number[];
  lines: TableLine[];
}

/** A line drawn as text: borders as they are, cells between `│` bars. */
export function tableLineText(line: TableLine): string {
  return line.kind === "border" ? line.text : `│ ${line.cells.join(" │ ")} │`;
}

/** Column widths that fit `available` columns: start from each column's natural width and trim the widest, down to a floor. */
function fitWidths(natural: number[], available: number): number[] {
  const widths = [...natural];
  for (const floor of [6, 3, 1]) {
    while (widths.reduce((sum, width) => sum + width, 0) > available) {
      let widest = -1;
      widths.forEach((width, column) => {
        if (width > Math.min(floor, natural[column]!) && (widest === -1 || width > widths[widest]!)) widest = column;
      });
      if (widest === -1) break;
      widths[widest]! -= 1;
    }
    if (widths.reduce((sum, width) => sum + width, 0) <= available) break;
  }
  return widths;
}

function rule(widths: number[], left: string, middle: string, right: string): TableLine {
  return { kind: "border", text: left + widths.map((width) => "─".repeat(width + 2)).join(middle) + right };
}

/**
 * Lays out `rows` (the first is the header) for a terminal `maxWidth` columns wide. Columns keep their natural
 * width when everything fits; otherwise the widest are narrowed and their cells wrap. Rows are separated by
 * rules only when some cell wrapped, which is when a row is no longer one line tall.
 */
export function layoutTable(rows: string[][], align: Align[], maxWidth: number): TableLayout {
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columns === 0) return { widths: [], lines: [] };

  const text = rows.map((row) => Array.from({ length: columns }, (_, column) => plainText(row[column] ?? "")));
  const natural = Array.from({ length: columns }, (_, column) => Math.max(1, ...text.map((row) => displayWidth(row[column]!))));
  const overhead = 3 * columns + 1;
  const widths = fitWidths(natural, maxWidth - overhead);

  const wrapped = text.map((row) => row.map((cell, column) => wrapText(cell, widths[column]!)));
  const anyWrapped = wrapped.some((row) => row.some((cell) => cell.length > 1));

  const lines: TableLine[] = [rule(widths, "┌", "┬", "┐")];
  wrapped.forEach((row, rowIndex) => {
    const height = Math.max(...row.map((cell) => cell.length));
    for (let sub = 0; sub < height; sub += 1) {
      lines.push({
        kind: rowIndex === 0 ? "header" : "row",
        cells: row.map((cell, column) => pad(cell[sub] ?? "", widths[column]!, align[column] ?? "left")),
      });
    }
    if (rowIndex === 0 && rows.length > 1) lines.push(rule(widths, "├", "┼", "┤"));
    else if (anyWrapped && rowIndex > 0 && rowIndex < wrapped.length - 1) lines.push(rule(widths, "├", "┼", "┤"));
  });
  lines.push(rule(widths, "└", "┴", "┘"));
  return { widths, lines };
}
