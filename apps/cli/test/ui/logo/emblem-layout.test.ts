import { describe, expect, it } from "vitest";
import { EMBLEM_LARGE, EMBLEM_MEDIUM, type EmblemArt } from "../../../src/ui/logo/emblem-art.js";
import { chooseHeaderLayout, emblemFor, emblemRuns } from "../../../src/ui/logo/emblem-layout.js";

const isBraille = (char: string) => char >= "⠁" && char <= "⣿";

describe.each([
  ["EMBLEM_LARGE", EMBLEM_LARGE, 14, 28],
  ["EMBLEM_MEDIUM", EMBLEM_MEDIUM, 7, 14],
] as [string, EmblemArt, number, number][])("%s (generated data)", (_name, art, rows, columns) => {
  it("has the expected size, every row the same width", () => {
    expect(art.rows).toHaveLength(rows);
    expect(art.tones).toHaveLength(rows);
    for (const row of art.rows) expect(row).toHaveLength(columns);
    for (const tones of art.tones) expect(tones).toHaveLength(columns);
  });

  it("is made only of spaces and braille dots, with a tone digit exactly under each dotted cell", () => {
    art.rows.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const tone = art.tones[y]![x]!;
        if (char === " ") expect(tone).toBe(" ");
        else {
          expect(isBraille(char)).toBe(true);
          expect(tone).toMatch(/^[0-9]$/);
        }
      });
    });
  });

  it("draws a real shape, not a blank or a solid block", () => {
    const cells = art.rows.join("");
    const dotted = [...cells].filter(isBraille).length;
    expect(dotted).toBeGreaterThan(columns);
    expect(dotted).toBeLessThan(cells.length / 2);
  });

  it("fades from the green end at the top to the cyan end at the bottom", () => {
    const meanTone = (tones: string) => {
      const digits = [...tones].filter((char) => char !== " ").map(Number);
      return digits.reduce((sum, digit) => sum + digit, 0) / Math.max(1, digits.length);
    };
    const firstFilled = art.tones.find((line) => line.trim() !== "")!;
    const lastFilled = [...art.tones].reverse().find((line) => line.trim() !== "")!;
    expect(meanTone(lastFilled)).toBeGreaterThan(meanTone(firstFilled) + 3);
  });
});

describe("emblemRuns", () => {
  const art: EmblemArt = { rows: ["  ⣿⣿⡇ ", "⠁     "], tones: ["  001 ", "9     "] };

  it("joins back to each row's text", () => {
    expect(emblemRuns(art).map((runs) => runs.map((run) => run.text).join(""))).toEqual(art.rows);
  });

  it("groups neighbouring cells with the same tone, and empty cells without one", () => {
    expect(emblemRuns(art)[0]).toEqual([{ text: "  " }, { text: "⣿⣿", tone: 0 }, { text: "⡇", tone: 1 }, { text: " " }]);
    expect(emblemRuns(art)[1]).toEqual([{ text: "⠁", tone: 9 }, { text: "     " }]);
  });

  it("reads the real data back without losing a cell", () => {
    const runs = emblemRuns(EMBLEM_LARGE);
    runs.forEach((line, y) => expect(line.map((run) => run.text).join("")).toBe(EMBLEM_LARGE.rows[y]));
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
