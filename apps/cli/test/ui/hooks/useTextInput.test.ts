import { describe, expect, it } from "vitest";
import { deleteBefore, insertAt, locateCursor, moveCursor } from "../../../src/ui/hooks/useTextInput.js";

describe("insertAt", () => {
  it("inserts at the cursor and advances it", () => {
    expect(insertAt({ value: "ac", cursor: 1 }, "b")).toEqual({ value: "abc", cursor: 2 });
  });

  it("handles multi-character and newline input", () => {
    expect(insertAt({ value: "", cursor: 0 }, "a\nb")).toEqual({ value: "a\nb", cursor: 3 });
  });
});

describe("deleteBefore", () => {
  it("removes the character before the cursor", () => {
    expect(deleteBefore({ value: "abc", cursor: 2 })).toEqual({ value: "ac", cursor: 1 });
  });

  it("does nothing at the start", () => {
    const state = { value: "abc", cursor: 0 };
    expect(deleteBefore(state)).toBe(state);
  });
});

describe("moveCursor", () => {
  it("moves within the text and clamps at both ends", () => {
    expect(moveCursor({ value: "abc", cursor: 1 }, 1).cursor).toBe(2);
    expect(moveCursor({ value: "abc", cursor: 0 }, -1).cursor).toBe(0);
    expect(moveCursor({ value: "abc", cursor: 3 }, 1).cursor).toBe(3);
  });
});

describe("locateCursor", () => {
  it("maps an offset on a single line", () => {
    expect(locateCursor("hello", 3)).toEqual({ line: 0, col: 3 });
  });

  it("accounts for newline boundaries", () => {
    expect(locateCursor("ab\ncd", 2)).toEqual({ line: 0, col: 2 });
    expect(locateCursor("ab\ncd", 3)).toEqual({ line: 1, col: 0 });
    expect(locateCursor("ab\ncd", 5)).toEqual({ line: 1, col: 2 });
  });

  it("clamps an offset past the end to the last position", () => {
    expect(locateCursor("ab\ncd", 99)).toEqual({ line: 1, col: 2 });
  });

  it("handles an empty value", () => {
    expect(locateCursor("", 0)).toEqual({ line: 0, col: 0 });
  });
});
