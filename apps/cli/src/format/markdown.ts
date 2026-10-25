/**
 * Markdown block parsing for the transcript: headings, paragraphs, lists (nested, ordered, task),
 * quotes, fenced code, tables and rules. Pure: it returns data and the components only draw it.
 *
 * It reads line by line and is built for text that is still streaming in: an unterminated code fence
 * is a code block that runs to the end, and a half-typed table row is just a paragraph until it
 * closes. Inline styling (bold, links, ...) is a separate step: see inline.ts.
 */

export type Align = "left" | "center" | "right";

export interface ListItem {
  /** 0 for a top-level item, 1 for one nested under it, and so on. */
  depth: number;
  /** Present for an ordered item; bullets have none. */
  number?: number;
  /** Present for a task item (`- [ ]` / `- [x]`). */
  checked?: boolean;
  text: string;
}

export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: ListItem[] }
  | { type: "quote"; text: string }
  | { type: "code"; language: string; content: string }
  /** `rows[0]` is the header row; every row has the same number of cells. */
  | { type: "table"; rows: string[][]; align: Align[] }
  | { type: "rule" };

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const TASK = /^\[([ xX])\][ \t]+(.*)$/;
/** Under the header, a single hyphen is enough (`:-:`); anywhere else we only drop obvious `---` rows, so a data row of `-` cells survives. */
const SEPARATOR_CELL_LENIENT = /^:?-+:?$/;
const SEPARATOR_CELL_STRICT = /^:?-{2,}:?$/;

const isTableRow = (line: string) => {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith("|") && trimmed.endsWith("|");
};

const indentWidth = (whitespace: string) => whitespace.replace(/\t/g, "    ").length;

/** Splits a `| a | b |` row into trimmed cells; `\|` stays inside a cell. */
function splitRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner
    .replace(/\\\|/g, "\u0000")
    .split("|")
    .map((cell) => cell.replace(/\u0000/g, "|").trim());
}

const isSeparatorRow = (cells: string[], lenient: boolean) =>
  cells.length > 0 && cells.every((cell) => (lenient ? SEPARATOR_CELL_LENIENT : SEPARATOR_CELL_STRICT).test(cell));

function alignmentOf(cell: string): Align {
  if (cell.startsWith(":") && cell.endsWith(":")) return "center";
  return cell.endsWith(":") ? "right" : "left";
}

/** Joins a paragraph's lines: a soft line break becomes a space, a hard break (two trailing spaces or `\`) stays a newline. */
function joinParagraph(lines: string[]): string {
  let text = "";
  lines.forEach((line, index) => {
    const hard = / {2,}$/.test(line) || /(?<!\\)\\$/.test(line);
    text += line.trim().replace(/(?<!\\)\\$/, "");
    if (index < lines.length - 1) text += hard ? "\n" : " ";
  });
  return text;
}

/** Quote lines to text: runs of non-empty lines become one paragraph, and an empty `>` line starts a new one. */
function joinQuote(lines: string[]): string {
  const paragraphs: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1]!.push(line.trim());
  }
  return paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => paragraph.join(" "))
    .join("\n");
}

/**
 * Markdown lets a list be numbered `1.` on every line and renumbers it when drawn. Within each run of
 * ordered siblings that all carry the same number, count up from it; anything else keeps its own numbers.
 */
function renumber(items: ListItem[]): void {
  const open = new Map<number, ListItem[]>();
  const runs: ListItem[][] = [];
  for (const item of items) {
    for (const depth of [...open.keys()]) if (depth > item.depth) open.delete(depth);
    if (item.number === undefined) continue;
    let run = open.get(item.depth);
    if (!run) {
      run = [];
      open.set(item.depth, run);
      runs.push(run);
    }
    run.push(item);
  }
  for (const run of runs) {
    const first = run[0]!.number!;
    if (run.length > 1 && run.every((item) => item.number === first)) run.forEach((item, index) => (item.number = first + index));
  }
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: ListItem[] = [];
  let indentStack: number[] = [];
  let lastItemIndent = 0;
  let blankSeen = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: joinParagraph(paragraph) });
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length > 0) blocks.push({ type: "quote", text: joinQuote(quote) });
    quote = [];
  };
  const flushList = () => {
    if (list.length > 0) {
      renumber(list);
      blocks.push({ type: "list", items: list });
    }
    list = [];
    indentStack = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushQuote();
    flushList();
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      flushParagraph();
      flushQuote();
      blankSeen = true;
      i += 1;
      continue;
    }

    const indent = indentWidth(/^\s*/.exec(line)![0]);
    const item = ITEM.exec(line);

    // After a blank line only another item keeps a list going.
    if (list.length > 0 && blankSeen && !item) flushList();

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      flushAll();
      const marker = fence[2]!;
      const fenceIndent = indentWidth(fence[1]!);
      const body: string[] = [];
      i += 1;
      while (i < lines.length) {
        const close = FENCE_CLOSE.exec(lines[i]!);
        if (close && close[1]![0] === marker[0] && close[1]!.length >= marker.length) {
          i += 1;
          break;
        }
        body.push(lines[i]!.replace(new RegExp(`^[ \\t]{0,${fenceIndent}}`), ""));
        i += 1;
      }
      blocks.push({ type: "code", language: fence[3] ?? "", content: body.join("\n") });
      blankSeen = false;
      continue;
    }

    // Text indented under a list item, with no blank line between, continues that item.
    if (list.length > 0 && !blankSeen && !item && indent > lastItemIndent) {
      const last = list[list.length - 1]!;
      last.text = `${last.text} ${line.trim()}`;
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]! });
      blankSeen = false;
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      flushAll();
      blocks.push({ type: "rule" });
      blankSeen = false;
      i += 1;
      continue;
    }

    if (isTableRow(line)) {
      flushAll();
      const rows: string[][] = [];
      const align: Align[] = [];
      let separatorSeen = false;
      while (i < lines.length && isTableRow(lines[i]!)) {
        const cells = splitRow(lines[i]!);
        const underHeader = rows.length === 1 && !separatorSeen;
        if (isSeparatorRow(cells, underHeader)) {
          if (underHeader) cells.forEach((cell, column) => (align[column] = alignmentOf(cell)));
          separatorSeen = true;
        } else {
          rows.push(cells);
        }
        i += 1;
      }
      const columns = Math.max(0, ...rows.map((row) => row.length));
      if (columns > 0) {
        blocks.push({
          type: "table",
          rows: rows.map((row) => Array.from({ length: columns }, (_, column) => row[column] ?? "")),
          align: Array.from({ length: columns }, (_, column) => align[column] ?? "left"),
        });
      }
      blankSeen = false;
      continue;
    }

    const quoted = QUOTE.exec(line);
    if (quoted) {
      flushParagraph();
      flushList();
      quote.push(quoted[1]!);
      blankSeen = false;
      i += 1;
      continue;
    }

    if (item) {
      flushParagraph();
      flushQuote();
      const markerIndent = indentWidth(item[1]!);
      while (indentStack.length > 0 && markerIndent < indentStack[indentStack.length - 1]!) indentStack.pop();
      if (indentStack.length === 0 || markerIndent > indentStack[indentStack.length - 1]!) indentStack.push(markerIndent);

      const ordered = /^\d/.test(item[2]!);
      let text = item[3]!;
      const entry: ListItem = { depth: indentStack.length - 1, text };
      if (ordered) entry.number = parseInt(item[2]!, 10);
      const task = TASK.exec(text);
      if (task) {
        entry.checked = task[1] !== " ";
        text = task[2]!;
        entry.text = text;
      }
      list.push(entry);
      lastItemIndent = markerIndent;
      blankSeen = false;
      i += 1;
      continue;
    }

    // Plain text. It ends a list and a quote that were running.
    if (list.length > 0) flushList();
    flushQuote();
    paragraph.push(line);
    blankSeen = false;
    i += 1;
  }

  flushAll();
  return blocks;
}
