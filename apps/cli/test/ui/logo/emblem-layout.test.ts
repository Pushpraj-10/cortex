import { describe, expect, it } from "vitest";
import { EMBLEM_LARGE, EMBLEM_MEDIUM, type EmblemArt } from "../../../src/ui/logo/emblem-art.js";
import { chooseHeaderLayout, emblemFor } from "../../../src/ui/logo/emblem-layout.js";

const isBraille = (char: string) => char >= "⠁" && char <= "⣿";

describe.each([
  ["EMBLEM_LARGE", EMBLEM_LARGE, 14, 28],
  ["EMBLEM_MEDIUM", EMBLEM_MEDIUM, 7, 14],
] as [string, EmblemArt, number, number][])("%s (generated data)", (_name, art, rows, columns) => {
  it("has the expected size, every row the same width", () => {
    expect(art.rows).toHaveLength(rows);
    for (const row of art.rows) expect(row).toHaveLength(columns);
  });

  it("is made only of spaces and braille dots", () => {
    for (const row of art.rows) for (const char of row) expect(char === " " || isBraille(char)).toBe(true);
  });

  it("draws a real shape, not a blank or a solid block", () => {
    const cells = art.rows.join("");
    const dotted = [...cells].filter(isBraille).length;
    expect(dotted).toBeGreaterThan(columns);
    expect(dotted).toBeLessThan(cells.length / 2);
  });

  it("uses the whole height and does not touch the right edge", () => {
    expect(art.rows[0]!.trim()).not.toBe("");
    expect(art.rows[rows - 1]!.trim()).not.toBe("");
    for (const row of art.rows) expect(row[row.length - 1]).toBe(" ");
  });
});

describe("chooseHeaderLayout", () => {
  it("shows the large emblem only when the terminal is both wide and tall", () => {
    expect(chooseHeaderLayout(120, 40)).toBe("large");
    expect(chooseHeaderLayout(78, 32)).toBe("large");
    expect(chooseHeaderLayout(77, 40)).toBe("medium");
    expect(chooseHeaderLayout(120, 31)).toBe("medium");
  });

  it("shows the medium emblem on a mid-sized terminal, including a standard 80x24 one", () => {
    expect(chooseHeaderLayout(56, 22)).toBe("medium");
    expect(chooseHeaderLayout(90, 22)).toBe("medium");
    expect(chooseHeaderLayout(80, 24)).toBe("medium");
  });

  it("falls back to the wordmark alone when there is no room", () => {
    expect(chooseHeaderLayout(55, 40)).toBe("compact");
    expect(chooseHeaderLayout(120, 21)).toBe("compact");
  });

  it("picks the emblem to match the layout", () => {
    expect(emblemFor("large")).toBe(EMBLEM_LARGE);
    expect(emblemFor("medium")).toBe(EMBLEM_MEDIUM);
  });
});
