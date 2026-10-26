import { describe, expect, it } from "vitest";
import { EMBLEM_LARGE, EMBLEM_MEDIUM, type EmblemArt } from "../../../src/ui/logo/emblem-art.js";
import { chooseHeaderLayout, emblemFor, emblemRuns } from "../../../src/ui/logo/emblem-layout.js";

const isBraille = (char: string) => char >= "⠁" && char <= "⣿";

describe.each([
  ["EMBLEM_LARGE", EMBLEM_LARGE, 7, 18],
  ["EMBLEM_MEDIUM", EMBLEM_MEDIUM, 4, 10],
] as [string, EmblemArt, number, number][])("%s (generated data)", (_name, art, rows, columns) => {
  it("has the expected size, every row the same width, and a tone for every cell", () => {
    expect(art.rows).toHaveLength(rows);
    expect(art.tones).toHaveLength(rows);
    for (const row of art.rows) expect(row).toHaveLength(columns);
    for (const tones of art.tones) expect(tones).toHaveLength(columns);
  });

  it("is made only of spaces and braille dots", () => {
    for (const row of art.rows) for (const char of row) expect(char === " " || isBraille(char)).toBe(true);
  });

  it("tones a cell exactly when it has dots, as red or panel", () => {
    art.rows.forEach((row, index) => {
      for (const [column, char] of [...row].entries()) {
        const tone = art.tones[index]![column]!;
        expect(char === " " ? tone : "RP".includes(tone) ? "dotted" : "bad").toBe(char === " " ? " " : "dotted");
      }
    });
  });

  it("draws both the red C and its panel, not a blank or a solid block", () => {
    const tones = art.tones.join("");
    expect([...tones].filter((tone) => tone === "R").length).toBeGreaterThan(columns / 2);
    expect([...tones].filter((tone) => tone === "P").length).toBeGreaterThan(columns / 4);
    expect([...art.rows.join("")].filter(isBraille).length).toBeLessThan(rows * columns); // some cells are left empty
  });

  it("uses the whole height and does not touch the right edge", () => {
    expect(art.rows[0]!.trim()).not.toBe("");
    expect(art.rows[rows - 1]!.trim()).not.toBe("");
  });
});

describe("emblemRuns", () => {
  it("joins neighbouring cells of one tone into a run, and leaves blanks without a tone", () => {
    const runs = emblemRuns({ rows: ["  ⠁⠂⠃ "], tones: ["  RRP "] });
    expect(runs).toEqual([
      [
        { text: "  ", tone: undefined },
        { text: "⠁⠂", tone: "primary" },
        { text: "⠃", tone: "panel" },
        { text: " ", tone: undefined },
      ],
    ]);
  });

  it("gives one line of runs per row of the real emblems, covering every cell", () => {
    for (const art of [EMBLEM_LARGE, EMBLEM_MEDIUM]) {
      const lines = emblemRuns(art);
      expect(lines).toHaveLength(art.rows.length);
      lines.forEach((runs, index) => expect(runs.map((run) => run.text).join("")).toBe(art.rows[index]));
    }
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
