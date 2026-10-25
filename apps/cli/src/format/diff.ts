/**
 * A line diff for showing a file change: which lines were added, removed or left alone, with their line
 * numbers, and unchanged lines far from any change collapsed into a gap. Pure data in, rows out.
 *
 * It trims the lines the two texts share at the start and end first, so a small edit in a big file only
 * ever compares the small middle; that middle is diffed with a longest-common-subsequence table, and past
 * a size limit it is simply shown as "all removed, all added" rather than spending time on it.
 */

export type DiffLine =
  | { kind: "add"; text: string; newLine: number }
  | { kind: "del"; text: string; oldLine: number }
  | { kind: "context"; text: string; oldLine: number; newLine: number };

/** `hidden` unchanged lines are not shown. */
export interface DiffGap {
  kind: "gap";
  hidden: number;
}

export type DiffRow = DiffLine | DiffGap;

export interface Diff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

export interface DiffOptions {
  /** The 1-based line number of the first line of both texts. Defaults to 1. */
  startLine?: number;
  /** Unchanged lines kept on each side of a change. Defaults to 2. */
  context?: number;
}

/** Above this many table cells the middle is not diffed line by line. */
const MAX_TABLE_CELLS = 4_000_000;

function linesOf(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
}

type Op = { kind: "context" | "del" | "add"; text: string };

/** The edit script turning `a` into `b`: LCS-based when small enough, otherwise everything out and everything in. */
function script(a: string[], b: string[]): Op[] {
  if (a.length * b.length > MAX_TABLE_CELLS) {
    return [...a.map((text): Op => ({ kind: "del", text })), ...b.map((text): Op => ({ kind: "add", text }))];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1]! + 1 : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: "context", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!) {
      ops.push({ kind: "del", text: a[i]! });
      i += 1;
    } else {
      ops.push({ kind: "add", text: b[j]! });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) ops.push({ kind: "del", text: a[i]! });
  for (; j < b.length; j += 1) ops.push({ kind: "add", text: b[j]! });
  return ops;
}

/**
 * Replaces the unchanged lines more than `context` away from any change with a gap row. A gap takes a row of its
 * own, so a run of just one line is shown as itself: hiding it would save nothing.
 */
function collapse(lines: DiffLine[], context: number): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.kind === "context") return;
    for (let near = Math.max(0, index - context); near <= Math.min(lines.length - 1, index + context); near += 1) keep[near] = true;
  });

  const rows: DiffRow[] = [];
  let pending: DiffLine[] = [];
  const flush = () => {
    if (pending.length === 1) rows.push(pending[0]!);
    else if (pending.length > 1) rows.push({ kind: "gap", hidden: pending.length });
    pending = [];
  };
  lines.forEach((line, index) => {
    if (keep[index]) {
      flush();
      rows.push(line);
    } else {
      pending.push(line);
    }
  });
  flush();
  return rows;
}

export function diffText(before: string, after: string, options: DiffOptions = {}): Diff {
  const startLine = options.startLine ?? 1;
  const context = options.context ?? 2;
  const a = linesOf(before);
  const b = linesOf(after);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;

  const ops: Op[] = [
    ...a.slice(0, prefix).map((text): Op => ({ kind: "context", text })),
    ...script(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix)),
    ...a.slice(a.length - suffix).map((text): Op => ({ kind: "context", text })),
  ];

  let oldLine = startLine;
  let newLine = startLine;
  let added = 0;
  let removed = 0;
  const lines: DiffLine[] = ops.map((op): DiffLine => {
    if (op.kind === "context") return { kind: "context", text: op.text, oldLine: oldLine++, newLine: newLine++ };
    if (op.kind === "del") {
      removed += 1;
      return { kind: "del", text: op.text, oldLine: oldLine++ };
    }
    added += 1;
    return { kind: "add", text: op.text, newLine: newLine++ };
  });

  return { rows: added + removed === 0 ? [] : collapse(lines, context), added, removed };
}

/** The first `max` rows, and how many were left out. */
export function truncateRows(rows: DiffRow[], max: number): { rows: DiffRow[]; hidden: number } {
  const shown = rows.slice(0, Math.max(0, max));
  return { rows: shown, hidden: rows.length - shown.length };
}
