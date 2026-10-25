import { describe, expect, it } from "vitest";
import {
  continueLine,
  deleteBefore,
  deleteToLineEnd,
  deleteToLineStart,
  deleteWordBefore,
  insertAt,
  lineEndOf,
  lineStartOf,
  locateCursor,
  moveCursor,
  moveToLineEnd,
  moveToLineStart,
  moveVertical,
  moveWordLeft,
  moveWordRight,
  normalizePaste,
} from "../../../src/ui/hooks/useTextInput.js";

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

describe("word movement", () => {
  it("moves to the start of the previous word, skipping whitespace first", () => {
    expect(moveWordLeft({ value: "fix the  parser", cursor: 15 }).cursor).toBe(9);
    expect(moveWordLeft({ value: "fix the  parser", cursor: 9 }).cursor).toBe(4);
    expect(moveWordLeft({ value: "fix the  parser", cursor: 4 }).cursor).toBe(0);
    expect(moveWordLeft({ value: "fix", cursor: 0 }).cursor).toBe(0);
  });

  it("moves to the end of the next word, skipping whitespace first", () => {
    expect(moveWordRight({ value: "fix the  parser", cursor: 0 }).cursor).toBe(3);
    expect(moveWordRight({ value: "fix the  parser", cursor: 3 }).cursor).toBe(7);
    expect(moveWordRight({ value: "fix the  parser", cursor: 7 }).cursor).toBe(15);
    expect(moveWordRight({ value: "fix", cursor: 3 }).cursor).toBe(3);
  });

  it("treats a newline as whitespace between words", () => {
    expect(moveWordLeft({ value: "one\ntwo", cursor: 4 }).cursor).toBe(0);
    expect(moveWordRight({ value: "one\ntwo", cursor: 3 }).cursor).toBe(7);
  });
});

describe("line start and end", () => {
  const value = "first\nsecond\nthird";

  it("finds the bounds of the line the cursor is on", () => {
    expect(lineStartOf(value, 8)).toBe(6);
    expect(lineEndOf(value, 8)).toBe(12);
    expect(lineStartOf(value, 0)).toBe(0);
    expect(lineEndOf(value, value.length)).toBe(value.length);
  });

  it("treats the cursor sitting right after a newline as the start of the next line", () => {
    expect(lineStartOf(value, 6)).toBe(6);
    expect(lineEndOf(value, 5)).toBe(5);
  });

  it("moves the cursor there", () => {
    expect(moveToLineStart({ value, cursor: 9 }).cursor).toBe(6);
    expect(moveToLineEnd({ value, cursor: 9 }).cursor).toBe(12);
  });
});

describe("deleting words and lines", () => {
  it("ctrl+w deletes the word before the cursor and the spaces after it", () => {
    expect(deleteWordBefore({ value: "fix the parser", cursor: 14 })).toEqual({ value: "fix the ", cursor: 8 });
    expect(deleteWordBefore({ value: "fix the   ", cursor: 10 })).toEqual({ value: "fix ", cursor: 4 });
    expect(deleteWordBefore({ value: "fix the parser", cursor: 7 })).toEqual({ value: "fix  parser", cursor: 4 });
    expect(deleteWordBefore({ value: "abc", cursor: 0 })).toEqual({ value: "abc", cursor: 0 });
  });

  it("ctrl+u deletes back to the start of the line, leaving other lines alone", () => {
    expect(deleteToLineStart({ value: "one\ntwo three", cursor: 8 })).toEqual({ value: "one\nthree", cursor: 4 });
    expect(deleteToLineStart({ value: "one\ntwo", cursor: 4 })).toEqual({ value: "one\ntwo", cursor: 4 });
  });

  it("ctrl+k deletes to the end of the line, and at the end of a line joins the next one", () => {
    expect(deleteToLineEnd({ value: "one two\nthree", cursor: 3 })).toEqual({ value: "one\nthree", cursor: 3 });
    expect(deleteToLineEnd({ value: "one\nthree", cursor: 3 })).toEqual({ value: "onethree", cursor: 3 });
    expect(deleteToLineEnd({ value: "one", cursor: 3 })).toEqual({ value: "one", cursor: 3 });
  });
});

describe("moveVertical", () => {
  const value = "abcdef\nxy\nlonger line";

  it("keeps the column when the target line is long enough, and clamps it when not", () => {
    expect(moveVertical({ value, cursor: 4 }, 1)).toEqual({ value, cursor: 9 }); // col 4 -> end of "xy"
    expect(moveVertical({ value, cursor: 9 }, 1)).toEqual({ value, cursor: 12 }); // col 2 of "longer line"
    expect(moveVertical({ value, cursor: 14 }, -1)).toEqual({ value, cursor: 9 });
  });

  it("returns undefined at the first and last line, so the caller can fall back to history", () => {
    expect(moveVertical({ value, cursor: 2 }, -1)).toBeUndefined();
    expect(moveVertical({ value, cursor: value.length }, 1)).toBeUndefined();
    expect(moveVertical({ value: "one line", cursor: 3 }, 1)).toBeUndefined();
    expect(moveVertical({ value: "", cursor: 0 }, -1)).toBeUndefined();
  });
});

describe("continueLine (backslash + enter)", () => {
  it("replaces a backslash before the cursor with a newline", () => {
    expect(continueLine({ value: "first \\", cursor: 7 })).toEqual({ value: "first \n", cursor: 7 });
    expect(continueLine({ value: "a\\c", cursor: 2 })).toEqual({ value: "a\nc", cursor: 2 });
  });

  it("does nothing without a backslash right before the cursor", () => {
    expect(continueLine({ value: "first", cursor: 5 })).toBeUndefined();
    expect(continueLine({ value: "a\\c", cursor: 3 })).toBeUndefined();
    expect(continueLine({ value: "", cursor: 0 })).toBeUndefined();
  });
});

describe("normalizePaste", () => {
  it("turns every kind of line break into a newline", () => {
    expect(normalizePaste("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("turns tabs into spaces and drops other control characters and the escape byte", () => {
    expect(normalizePaste("a\tb")).toBe("a  b");
    expect(normalizePaste("a\u0007b\u007fc\u001b[d")).toBe("abc[d");
  });

  it("drops line breaks and tabs for a one-line field, so a pasted key's trailing newline is not part of it", () => {
    expect(normalizePaste("sk-abc123\r", { singleLine: true })).toBe("sk-abc123");
    expect(normalizePaste("sk-\nabc\r\n123\t", { singleLine: true })).toBe("sk-abc123");
  });

  it("leaves ordinary text, unicode and blank lines alone", () => {
    expect(normalizePaste("héllo ✓ 世界\n\nend")).toBe("héllo ✓ 世界\n\nend");
  });
});
