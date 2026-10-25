import { describe, expect, it } from "vitest";
import { WORDMARK, chooseLogo, packHalfBlocks, wordBitmap } from "../../../src/ui/logo/pixel-logo.js";

describe("wordBitmap", () => {
  it("is 7 rows of lit and dark pixels, 5 columns per letter plus a one-column gap", () => {
    const bitmap = wordBitmap(WORDMARK);
    expect(bitmap).toHaveLength(7);
    for (const row of bitmap) {
      expect(row).toHaveLength(6 * 5 + 5);
      expect(row).toMatch(/^[#.]+$/);
    }
  });

  it("widens with a bigger gap", () => {
    expect(wordBitmap(WORDMARK, 2)[0]).toHaveLength(6 * 5 + 5 * 2);
  });

  it("draws different shapes for different letters", () => {
    const shapes = new Set([...WORDMARK].map((letter) => wordBitmap(letter).join("/")));
    expect(shapes.size).toBe(new Set(WORDMARK).size);
  });

  it("falls back to a placeholder glyph for a letter it has no shape for", () => {
    expect(wordBitmap("?")).toEqual(wordBitmap("X"));
  });
});

describe("packHalfBlocks", () => {
  it("turns two stacked pixels into one half-block character", () => {
    expect(packHalfBlocks(["#.", "##", "..", "#."])).toEqual(["█▄", "▄ "]);
    expect(packHalfBlocks(["#.", ".."])).toEqual(["▀ "]);
  });

  it("pairs an odd last row with a dark one", () => {
    expect(packHalfBlocks(["#", "#", "#"])).toEqual(["█", "▀"]);
  });
});

describe("chooseLogo", () => {
  it("uses the full wordmark on a wide terminal: 4 text rows of 35 columns of half-blocks only", () => {
    const art = chooseLogo(80);
    expect(art.variant).toBe("full");
    expect(art.rows).toHaveLength(4);
    expect(art.width).toBe(35);
    for (const row of art.rows) {
      expect(row).toHaveLength(35);
      expect(row).toMatch(/^[▀▄█ ]+$/);
    }
  });

  it("switches variant exactly at the widths that fit", () => {
    expect(chooseLogo(35).variant).toBe("full");
    expect(chooseLogo(34)).toMatchObject({ variant: "spaced", rows: ["C O R T E X"], width: 11 });
    expect(chooseLogo(11).variant).toBe("spaced");
    expect(chooseLogo(10)).toMatchObject({ variant: "plain", rows: ["CORTEX"], width: 6 });
  });

  it("never returns less than the plain word, however narrow", () => {
    expect(chooseLogo(0).variant).toBe("plain");
    expect(chooseLogo(-5).variant).toBe("plain");
  });
});
