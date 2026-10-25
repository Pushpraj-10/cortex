import { describe, expect, it } from "vitest";
import { displayWidth, layoutTable, tableLineText, wrapText } from "../../src/format/table.js";

const draw = (rows: string[][], align: ("left" | "center" | "right")[], width: number) =>
  layoutTable(rows, align, width).lines.map(tableLineText);

describe("displayWidth", () => {
  it("counts ASCII as one column each", () => {
    expect(displayWidth("hello")).toBe(5);
    expect(displayWidth("")).toBe(0);
  });

  it("counts CJK and emoji as two columns", () => {
    expect(displayWidth("日本語")).toBe(6);
    expect(displayWidth("a😀")).toBe(3);
  });

  it("counts combining marks and zero-width characters as nothing", () => {
    expect(displayWidth("é")).toBe(1);
    expect(displayWidth("a​b")).toBe(2);
  });
});

describe("wrapText", () => {
  it("leaves text that fits alone", () => {
    expect(wrapText("short", 10)).toEqual(["short"]);
  });

  it("wraps at spaces", () => {
    expect(wrapText("one two three four", 9)).toEqual(["one two", "three", "four"]);
  });

  it("cuts a word wider than the column", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("cuts a long word after text already on the line", () => {
    expect(wrapText("ab cdefghi", 4)).toEqual(["ab", "cdef", "ghi"]);
  });

  it("never splits a wide character in half", () => {
    expect(wrapText("日本語", 5)).toEqual(["日本", "語"]);
  });
});

describe("layoutTable: fitting", () => {
  const rows = [
    ["Name", "Qty"],
    ["apple", "3"],
  ];

  it("draws a boxed table at natural widths when it fits", () => {
    expect(draw(rows, ["left", "left"], 80)).toEqual([
      "┌───────┬─────┐",
      "│ Name  │ Qty │",
      "├───────┼─────┤",
      "│ apple │ 3   │",
      "└───────┴─────┘",
    ]);
  });

  it("aligns cells right and centre", () => {
    expect(draw(rows, ["center", "right"], 80)).toEqual([
      "┌───────┬─────┐",
      "│ Name  │ Qty │",
      "├───────┼─────┤",
      "│ apple │   3 │",
      "└───────┴─────┘",
    ]);
    expect(layoutTable([["abcde"], ["x"]], ["center"], 80).lines[3]).toEqual({ kind: "row", cells: ["  x  "] });
  });

  it("shows markup as plain text and measures it that way", () => {
    expect(draw([["**Bold**", "`code`"]], ["left", "left"], 80)[1]).toBe("│ Bold │ code │");
  });

  it("narrows the widest column and wraps its cells when the terminal is narrow", () => {
    const lines = draw(
      [
        ["Path", "Description"],
        ["a", "this description is much too long to fit on one line"],
      ],
      ["left", "left"],
      30,
    );
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(30);
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.join("\n")).toContain("description");
  });

  it("puts a rule between body rows only when some row wrapped", () => {
    const fits = layoutTable([["h"], ["a"], ["b"]], ["left"], 80).lines.filter((line) => line.kind === "border");
    expect(fits).toHaveLength(3); // top, under the header, bottom

    const wraps = layoutTable([["h"], ["a very long cell that must wrap around"], ["b"]], ["left"], 14).lines.filter((line) => line.kind === "border");
    expect(wraps).toHaveLength(4); // plus one between the two body rows
  });

  it("keeps every column at least one character even when nothing fits", () => {
    const { widths } = layoutTable([["aaaa", "bbbb", "cccc"]], ["left", "left", "left"], 5);
    expect(widths.every((width) => width >= 1)).toBe(true);
  });

  it("is empty for no rows", () => {
    expect(layoutTable([], [], 80)).toEqual({ widths: [], lines: [] });
  });

  it("marks the first row as the header and the rest as rows", () => {
    const kinds = layoutTable(rows, ["left", "left"], 80).lines.map((line) => line.kind);
    expect(kinds).toEqual(["border", "header", "border", "row", "border"]);
  });

  it("pads short rows with empty cells", () => {
    expect(draw([["a", "b"], ["only"]], ["left", "left"], 80)[3]).toBe("│ only │   │");
  });
});
