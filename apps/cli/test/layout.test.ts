import { describe, expect, it } from "vitest";
import { inputTextRows, slashMenuRows, transcriptRows } from "../src/layout.js";
import { maxInputBoxLines } from "../src/theme.js";

describe("inputTextRows", () => {
  it("is one row per line typed, at least one", () => {
    expect(inputTextRows("")).toBe(1);
    expect(inputTextRows("one")).toBe(1);
    expect(inputTextRows("a\nb\nc")).toBe(3);
  });

  it("is capped at the input box maximum", () => {
    expect(inputTextRows("x\n".repeat(50))).toBe(maxInputBoxLines);
  });
});

describe("slashMenuRows", () => {
  it("is zero when closed", () => {
    expect(slashMenuRows(false, 5)).toBe(0);
  });

  it("is one row per match plus the border, or one 'no matches' row", () => {
    expect(slashMenuRows(true, 3)).toBe(5);
    expect(slashMenuRows(true, 0)).toBe(3);
  });
});

describe("transcriptRows", () => {
  const base = { rows: 40, inputValue: "", thinking: false, slashMenuRows: 0, promptRows: 0 };

  it("leaves the screen minus the input box (1 row + border) and the status line", () => {
    expect(transcriptRows(base)).toBe(40 - 3 - 1);
  });

  it("gives up one row to the thinking indicator and more to menus and prompts", () => {
    expect(transcriptRows({ ...base, thinking: true })).toBe(transcriptRows(base) - 1);
    expect(transcriptRows({ ...base, slashMenuRows: 5 })).toBe(transcriptRows(base) - 5);
    expect(transcriptRows({ ...base, promptRows: 4 })).toBe(transcriptRows(base) - 4);
  });

  it("grows the input box with extra lines but never past the cap", () => {
    expect(transcriptRows({ ...base, inputValue: "a\nb" })).toBe(transcriptRows(base) - 1);
    expect(transcriptRows({ ...base, inputValue: "x\n".repeat(50) })).toBe(40 - (maxInputBoxLines + 2) - 1);
  });

  it("never shrinks below 3 rows, even on a tiny terminal", () => {
    expect(transcriptRows({ ...base, rows: 5 })).toBe(3);
  });
});
