import { describe, expect, it } from "vitest";
import { inputTextRows, slashMenuRows, transcriptRows } from "../../src/ui/layout.js";
import { maxInputBoxLines } from "../../src/ui/theme/copy.js";

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
  const base = { rows: 40, inputValue: "", thinking: false };

  it("leaves the screen minus the input box (1 row + border) and the status line", () => {
    expect(transcriptRows(base)).toBe(40 - 3 - 1);
  });

  it("gives up one row to the thinking indicator", () => {
    expect(transcriptRows({ ...base, thinking: true })).toBe(transcriptRows(base) - 1);
  });

  it("takes no rows for menus and prompts, which are drawn over the transcript instead", () => {
    // LayoutInput has no field for them, so a menu or prompt opening cannot change the transcript's height.
    expect(Object.keys(base)).toEqual(["rows", "inputValue", "thinking"]);
    expect(transcriptRows(base)).toBe(40 - 3 - 1);
  });

  it("gives up one row to the ctrl+r search line while it is showing", () => {
    expect(transcriptRows({ ...base, historySearch: true })).toBe(transcriptRows(base) - 1);
    expect(transcriptRows({ ...base, historySearch: false })).toBe(transcriptRows(base));
  });

  it("grows the input box with extra lines but never past the cap", () => {
    expect(transcriptRows({ ...base, inputValue: "a\nb" })).toBe(transcriptRows(base) - 1);
    expect(transcriptRows({ ...base, inputValue: "x\n".repeat(50) })).toBe(40 - (maxInputBoxLines + 2) - 1);
  });

  it("never shrinks below 3 rows, even on a tiny terminal", () => {
    expect(transcriptRows({ ...base, rows: 5 })).toBe(3);
  });
});
