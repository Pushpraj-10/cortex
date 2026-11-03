import { describe, expect, it } from "vitest";
import { safeText } from "../../src/format/terminal-safe.js";

const ESC = "\u001b";
const BEL = "\u0007";

describe("safeText", () => {
  it("leaves ordinary text, newlines, tabs and non-ASCII letters alone", () => {
    const text = "plain text\n\tindented line\nnaïve café — 日本語 ✓";
    expect(safeText(text)).toBe(text);
    expect(safeText(text, { colour: true })).toBe(text);
    expect(safeText("")).toBe("");
  });

  describe("sequences that make the terminal do something", () => {
    it("removes a clipboard write (OSC 52), however it is ended", () => {
      expect(safeText(`before${ESC}]52;c;SGVsbG8=${BEL}after`)).toBe("beforeafter");
      expect(safeText(`before${ESC}]52;c;SGVsbG8=${ESC}\\after`)).toBe("beforeafter");
      expect(safeText(`before${ESC}]52;c;SGVsbG8=`)).toBe("before"); // never ended: runs to the end of the text
    });

    it("removes a window title and a hyperlink wrapper, keeping the visible text", () => {
      expect(safeText(`${ESC}]0;pwned${BEL}hello`)).toBe("hello");
      expect(safeText(`${ESC}]8;;https://evil.example${ESC}\\click here${ESC}]8;;${ESC}\\`)).toBe("click here");
    });

    it("removes cursor movement, screen clearing and mode changes, even when colour is allowed", () => {
      for (const sequence of [`${ESC}[2J`, `${ESC}[H`, `${ESC}[10;5H`, `${ESC}[2K`, `${ESC}[?1049h`, `${ESC}[?25l`, `${ESC}[3A`, `${ESC}[1;1f`, `${ESC}[6n`]) {
        expect(safeText(`a${sequence}b`), sequence).toBe("ab");
        expect(safeText(`a${sequence}b`, { colour: true }), sequence).toBe("ab");
      }
    });

    it("removes device-control, application-command and privacy strings", () => {
      expect(safeText(`a${ESC}Pq#0;2;0;0;0${ESC}\\b`)).toBe("ab");
      expect(safeText(`a${ESC}_Gf=24;payload${ESC}\\b`)).toBe("ab");
      expect(safeText(`a${ESC}^private${ESC}\\b`)).toBe("ab");
      expect(safeText(`a${ESC}Xstring${ESC}\\b`)).toBe("ab");
    });

    it("removes two-character escapes, such as the one that resets the terminal, without eating a newline", () => {
      expect(safeText(`a${ESC}cb`)).toBe("ab");
      expect(safeText(`a${ESC}Mb`)).toBe("ab");
      expect(safeText(`a${ESC}\nb`)).toBe("a\nb");
      expect(safeText(`end${ESC}`)).toBe("end");
    });
  });

  describe("colour", () => {
    const red = `${ESC}[31mred${ESC}[0m`;

    it("is removed unless asked for", () => {
      expect(safeText(red)).toBe("red");
    });

    it("is kept when asked for, since it cannot move or hide anything we care about", () => {
      expect(safeText(red, { colour: true })).toBe(red);
      expect(safeText(`${ESC}[1;38;5;208mx${ESC}[m`, { colour: true })).toBe(`${ESC}[1;38;5;208mx${ESC}[m`);
      expect(safeText(`${ESC}[38:2:255:0:0mx`, { colour: true })).toBe(`${ESC}[38:2:255:0:0mx`);
    });

    it("keeps only colour: a screen clear next to it still goes", () => {
      expect(safeText(`${ESC}[31m${ESC}[2Jred`, { colour: true })).toBe(`${ESC}[31mred`);
    });
  });

  describe("other control characters", () => {
    it("shows them as \\uXXXX instead of acting on them, or silently dropping them", () => {
      expect(safeText(`a${BEL}b`)).toBe("a\\u0007b");
      expect(safeText("a\bb")).toBe("a\\u0008b");
      expect(safeText("a\u0000b")).toBe("a\\u0000b");
      expect(safeText("a\u007fb")).toBe("a\\u007fb");
      expect(safeText("a\u000bb\u000cc")).toBe("a\\u000bb\\u000cc");
    });

    it("shows the 8-bit control characters the same way (U+009B is a CSI, U+009D an OSC)", () => {
      expect(safeText("a\u009b31mb")).toBe("a\\u009b31mb");
      expect(safeText("a\u009d0;titleb")).toBe("a\\u009d0;titleb");
    });

    it("shows the characters that reorder or hide text", () => {
      expect(safeText("safe‮txt.exe")).toBe("safe\\u202etxt.exe");
      expect(safeText("a⁦b⁩c‏d؜e")).toBe("a\\u2066b\\u2069c\\u200fd\\u061ce");
    });

    it("turns a carriage return into a line break, so it cannot overwrite what came before it", () => {
      expect(safeText("50%\r100%")).toBe("50%\n100%");
      expect(safeText("line one\r\nline two")).toBe("line one\nline two");
      expect(safeText("keep this\rhide that")).toBe("keep this\nhide that");
    });
  });

  describe("whatever the input, the output is only text", () => {
    /** A small repeatable pseudo-random generator, so a failure can be reproduced. */
    function random(seed: number) {
      let state = seed;
      return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
    }
    const pieces = [ESC, "[", "]", "P", "_", "^", "X", "\\", BEL, "\r", "\n", "\t", "0", "5", "2", ";", ":", "m", "H", "J", "?", "c", "a", " ", "\u009b", "‮", "\u0000", "\u007f", "é"];
    const samples = (count: number) => {
      const next = random(20240607);
      return Array.from({ length: count }, () => Array.from({ length: 1 + Math.floor(next() * 40) }, () => pieces[Math.floor(next() * pieces.length)]).join(""));
    };

    it("never contains an escape, a bell or any control but newline and tab, with colour off", () => {
      for (const sample of samples(3000)) {
        const safe = safeText(sample);
        expect(safe, JSON.stringify(sample)).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏؜]/);
      }
    });

    it("with colour on, contains an escape only as part of a complete colour sequence", () => {
      for (const sample of samples(3000)) {
        const safe = safeText(sample, { colour: true });
        const withoutColour = safe.replace(/\u001b\[[0-9;:]*m/g, "");
        expect(withoutColour, JSON.stringify(sample)).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩‎‏؜]/);
      }
    });

    it("is stable: making text safe twice changes nothing more", () => {
      for (const sample of samples(1000)) {
        for (const colour of [false, true]) {
          const once = safeText(sample, { colour });
          expect(safeText(once, { colour }), JSON.stringify(sample)).toBe(once);
        }
      }
    });

    it("keeps a line break a line break: it never joins two lines or splits a word", () => {
      expect(safeText(`one${ESC}[2J\ntwo`)).toBe("one\ntwo");
      expect(safeText(`one\n${ESC}]0;t${BEL}two`)).toBe("one\ntwo");
    });
  });
});
