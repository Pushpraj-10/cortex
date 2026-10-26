import { describe, expect, it } from "vitest";
import { ellipsize, fitPieces, piecesWidth, type Piece } from "../../src/format/panel.js";
import { displayWidth } from "../../src/format/table.js";

const text = (pieces: Piece[]) => pieces.map((piece) => piece.text).join("");

describe("ellipsize", () => {
  it("cuts the end and adds an ellipsis, within the width", () => {
    expect(ellipsize("abcdefgh", 5)).toBe("abcd…");
    expect(displayWidth(ellipsize("abcdefgh", 5))).toBe(5);
  });

  it("cuts the start instead when asked, keeping the end", () => {
    expect(ellipsize("packages/a/b/file.ts", 10, "start")).toBe("…b/file.ts");
  });

  it("counts wide characters as two columns", () => {
    const cut = ellipsize("日本語日本語", 6);
    expect(displayWidth(cut)).toBeLessThanOrEqual(6);
    expect(cut.endsWith("…")).toBe(true);
  });

  it("gives nothing when there is no room", () => {
    expect(ellipsize("abc", 0)).toBe("");
  });
});

describe("fitPieces", () => {
  const row: Piece[] = [
    { text: "› ", color: "red" },
    { text: "/provider", bold: true },
    { text: "  Set up a provider's API key and model" },
  ];

  it("leaves a row that already fits alone", () => {
    expect(fitPieces(row, 80)).toBe(row);
    expect(piecesWidth(row)).toBe(displayWidth(text(row)));
  });

  it("cuts the end of a long row after an ellipsis, keeping each piece's style", () => {
    const fitted = fitPieces(row, 20);
    expect(piecesWidth(fitted)).toBe(20);
    expect(text(fitted).endsWith("…")).toBe(true);
    expect(fitted[0]).toEqual(row[0]);
    expect(fitted[1]).toEqual(row[1]);
    expect(fitted[2]!.text.startsWith("  Set")).toBe(true);
  });

  it("drops the pieces after the cut, and says so with an ellipsis even when a piece fits exactly", () => {
    const fitted = fitPieces([{ text: "abcde" }, { text: "fgh" }], 5);
    expect(text(fitted)).toBe("abcd…");
    expect(piecesWidth(fitted)).toBe(5);
  });

  it("cuts the front of the last piece when asked, so a path keeps its file name", () => {
    const path = `packages/${"deeply/".repeat(12)}nested/file.ts`;
    const fitted = fitPieces([{ text: "› " }, { text: path }], 40, "start");
    expect(piecesWidth(fitted)).toBe(40);
    expect(text(fitted).startsWith("› …")).toBe(true);
    expect(text(fitted).endsWith("nested/file.ts")).toBe(true);
  });

  it("falls back to cutting the end when the front cut leaves no room", () => {
    const fitted = fitPieces([{ text: "a long first piece " }, { text: "tail" }], 10, "start");
    expect(piecesWidth(fitted)).toBeLessThanOrEqual(10);
    expect(text(fitted).endsWith("…")).toBe(true);
  });

  it("never exceeds the width, at any width", () => {
    for (let width = 0; width <= 60; width += 1) {
      expect(piecesWidth(fitPieces(row, width)), `width ${width}`).toBeLessThanOrEqual(width);
    }
  });
});
