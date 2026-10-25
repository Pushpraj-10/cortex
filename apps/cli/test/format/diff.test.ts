import { describe, expect, it } from "vitest";
import { diffText, truncateRows, type DiffRow } from "../../src/format/diff.js";

const lines = (count: number, from = 1) => Array.from({ length: count }, (_, i) => `line${i + from}`).join("\n");
const shape = (rows: DiffRow[]) => rows.map((row) => (row.kind === "gap" ? `gap${row.hidden}` : `${row.kind}:${row.text}`));

describe("diffText", () => {
  it("has no rows when nothing changed", () => {
    expect(diffText("a\nb", "a\nb")).toEqual({ rows: [], added: 0, removed: 0 });
    expect(diffText("", "")).toEqual({ rows: [], added: 0, removed: 0 });
  });

  it("shows a changed line as a removal then an addition, with line numbers and context", () => {
    expect(diffText("a\nb\nc", "a\nB\nc")).toEqual({
      rows: [
        { kind: "context", text: "a", oldLine: 1, newLine: 1 },
        { kind: "del", text: "b", oldLine: 2 },
        { kind: "add", text: "B", newLine: 2 },
        { kind: "context", text: "c", oldLine: 3, newLine: 3 },
      ],
      added: 1,
      removed: 1,
    });
  });

  it("shows a new file as all added", () => {
    expect(diffText("", "x\ny")).toEqual({
      rows: [
        { kind: "add", text: "x", newLine: 1 },
        { kind: "add", text: "y", newLine: 2 },
      ],
      added: 2,
      removed: 0,
    });
  });

  it("shows an emptied file as all removed", () => {
    expect(diffText("x\ny", "")).toMatchObject({ added: 0, removed: 2 });
  });

  it("numbers lines from startLine", () => {
    const { rows } = diffText("a\nb", "a\nB", { startLine: 10 });
    expect(rows).toEqual([
      { kind: "context", text: "a", oldLine: 10, newLine: 10 },
      { kind: "del", text: "b", oldLine: 11 },
      { kind: "add", text: "B", newLine: 11 },
    ]);
  });

  it("keeps the old and new line numbers apart after an insertion", () => {
    const { rows } = diffText("a\nc\nd", "a\nb\nc\nd");
    expect(rows).toEqual([
      { kind: "context", text: "a", oldLine: 1, newLine: 1 },
      { kind: "add", text: "b", newLine: 2 },
      { kind: "context", text: "c", oldLine: 2, newLine: 3 },
      { kind: "context", text: "d", oldLine: 3, newLine: 4 },
    ]);
  });

  it("removes a single line without reporting its neighbours as changed (longest common subsequence)", () => {
    expect(shape(diffText("a\nb\nc\nd", "a\nc\nd").rows)).toEqual(["context:a", "del:b", "context:c", "context:d"]);
  });

  it("collapses unchanged lines far from a change into a gap, keeping two lines of context", () => {
    const after = lines(20).replace("line10", "X");
    const { rows, added, removed } = diffText(lines(20), after);
    expect(shape(rows)).toEqual(["gap7", "context:line8", "context:line9", "del:line10", "add:X", "context:line11", "context:line12", "gap8"]);
    expect([added, removed]).toEqual([1, 1]);
  });

  it("keeps the line numbers right across a gap", () => {
    const after = lines(20).replace("line10", "X");
    const rows = diffText(lines(20), after).rows;
    expect(rows[1]).toMatchObject({ kind: "context", oldLine: 8, newLine: 8 });
    expect(rows[5]).toMatchObject({ kind: "context", oldLine: 11, newLine: 11 });
  });

  it("puts a gap between two changes that are far apart, and none between close ones", () => {
    const far = lines(30).replace("line3", "A").replace("line27", "B");
    expect(shape(diffText(lines(30), far).rows).filter((row) => row.startsWith("gap"))).toEqual(["gap19"]);
    const close = shape(diffText(lines(30), lines(30).replace("line10", "A").replace("line13", "B")).rows);
    const between = close.slice(close.indexOf("add:A"), close.indexOf("del:line13"));
    expect(between.some((row) => row.startsWith("gap"))).toBe(false);
  });

  it("shows a lone unchanged line rather than a gap that hides just one", () => {
    // Line 30 is the only line beyond the two lines of context after the last change.
    const rows = diffText(lines(30), lines(30).replace("line27", "B")).rows;
    expect(shape(rows).slice(-2)).toEqual(["context:line29", "context:line30"]);
    expect(shape(rows).some((row) => row === "gap1")).toBe(false);
  });

  it("honours the context option", () => {
    const after = lines(10).replace("line5", "X");
    expect(shape(diffText(lines(10), after, { context: 0 }).rows)).toEqual(["gap4", "del:line5", "add:X", "gap5"]);
  });

  it("ignores a trailing newline and CRLF line endings", () => {
    expect(diffText("a\n", "a\n").rows).toEqual([]);
    expect(diffText("a\r\nb\r\n", "a\nb\n").rows).toEqual([]);
    expect(diffText("a\n", "a\nb\n")).toMatchObject({ added: 1, removed: 0 });
  });

  it("falls back to all removed then all added when the changed middle is too large to compare", () => {
    const before = Array.from({ length: 3000 }, (_, i) => `old${i}`).join("\n");
    const after = Array.from({ length: 3000 }, (_, i) => `new${i}`).join("\n");
    const { rows, added, removed } = diffText(before, after, { context: 0 });
    expect([added, removed]).toEqual([3000, 3000]);
    expect(rows[0]).toMatchObject({ kind: "del" });
    expect(rows[2999]).toMatchObject({ kind: "del" });
    expect(rows[3000]).toMatchObject({ kind: "add" });
  });

  it("stays fast for a small edit in a large file", () => {
    const big = lines(20_000);
    const started = Date.now();
    const { added, removed } = diffText(big, big.replace("line10000", "X"));
    expect([added, removed]).toEqual([1, 1]);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("truncateRows", () => {
  const rows: DiffRow[] = [{ kind: "gap", hidden: 1 }, { kind: "gap", hidden: 2 }, { kind: "gap", hidden: 3 }];

  it("keeps the first rows and says how many were left out", () => {
    expect(truncateRows(rows, 2)).toEqual({ rows: rows.slice(0, 2), hidden: 1 });
  });

  it("leaves a short list alone", () => {
    expect(truncateRows(rows, 5)).toEqual({ rows, hidden: 0 });
  });

  it("shows nothing for a limit of zero or less", () => {
    expect(truncateRows(rows, 0)).toEqual({ rows: [], hidden: 3 });
    expect(truncateRows(rows, -2)).toEqual({ rows: [], hidden: 3 });
  });
});
