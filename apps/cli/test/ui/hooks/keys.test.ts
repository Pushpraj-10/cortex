import { describe, expect, it } from "vitest";
import { edgeKeyOf, editFor, type EditingKey } from "../../../src/ui/hooks/keys.js";

const noKey: EditingKey = { ctrl: false, meta: false, backspace: false, delete: false, leftArrow: false, rightArrow: false };
const press = (typed: string, flags: Partial<EditingKey> = {}) => editFor(typed, { ...noKey, ...flags });

/** Presses a key with the cursor at `cursor` in `value`, and returns the text with `|` where the cursor ends up. */
function after(typed: string, flags: Partial<EditingKey>, value: string, cursor: number): string {
  const edit = press(typed, flags);
  if (typeof edit !== "function") throw new Error(`expected an edit, got ${String(edit)}`);
  const next = edit({ value, cursor });
  return `${next.value.slice(0, next.cursor)}|${next.value.slice(next.cursor)}`;
}

describe("edgeKeyOf", () => {
  it.each(["\u001b[H", "\u001bOH", "\u001b[1~", "\u001b[7~", "\u001b[1;5H", "\u001b[1;2H"])("reads %j as Home", (sequence) => {
    expect(edgeKeyOf(sequence)).toBe("home");
  });

  it.each(["\u001b[F", "\u001bOF", "\u001b[4~", "\u001b[8~", "\u001b[1;5F", "\u001b[1;2F"])("reads %j as End", (sequence) => {
    expect(edgeKeyOf(sequence)).toBe("end");
  });

  it.each(["a", "H", "", "\u001b", "\u001b[A", "\u001b[3~", "\u001b[5~", "\u001b[1;5D", "\u001b[HH", "typed H", "\u001b[200~"])(
    "does not mistake %j for either",
    (sequence) => {
      expect(edgeKeyOf(sequence)).toBeUndefined();
    },
  );
});

describe("editFor", () => {
  const text = "fix the parser";

  it("moves by character with the plain arrows and deletes with backspace and delete", () => {
    expect(after("", { leftArrow: true }, text, 3)).toBe("fi|x the parser");
    expect(after("", { rightArrow: true }, text, 3)).toBe("fix |the parser");
    expect(after("", { backspace: true }, text, 3)).toBe("fi| the parser");
    expect(after("", { delete: true }, text, 3)).toBe("fi| the parser");
  });

  it("moves by word with ctrl+arrows, alt+arrows and alt+b / alt+f", () => {
    expect(after("", { leftArrow: true, ctrl: true }, text, 14)).toBe("fix the |parser");
    expect(after("", { leftArrow: true, meta: true }, text, 14)).toBe("fix the |parser");
    expect(after("", { rightArrow: true, ctrl: true }, text, 0)).toBe("fix| the parser");
    expect(after("", { rightArrow: true, meta: true }, text, 0)).toBe("fix| the parser");
    expect(after("b", { meta: true }, text, 14)).toBe("fix the |parser");
    expect(after("f", { meta: true }, text, 0)).toBe("fix| the parser");
  });

  it("deletes a word with alt+backspace and ctrl+w", () => {
    expect(after("", { backspace: true, meta: true }, text, 14)).toBe("fix the |");
    expect(after("", { delete: true, meta: true }, text, 14)).toBe("fix the |");
    expect(after("w", { ctrl: true }, text, 14)).toBe("fix the |");
  });

  it("goes to the line start and end with ctrl+a and ctrl+e, and kills to either end with ctrl+u and ctrl+k", () => {
    expect(after("a", { ctrl: true }, text, 7)).toBe("|fix the parser");
    expect(after("e", { ctrl: true }, text, 7)).toBe("fix the parser|");
    expect(after("u", { ctrl: true }, text, 7)).toBe("| parser");
    expect(after("k", { ctrl: true }, text, 7)).toBe("fix the|");
  });

  it("ignores a ctrl or alt combination that nothing is bound to, so its letter is not typed", () => {
    expect(press("x", { ctrl: true })).toBe("ignore");
    expect(press("z", { ctrl: true })).toBe("ignore");
    expect(press("", { ctrl: true })).toBe("ignore");
    expect(press("x", { meta: true })).toBe("ignore");
    // the names of Object.prototype members are not bindings either
    expect(press("constructor", { ctrl: true })).toBe("ignore");
  });

  it("leaves everything else to the caller: plain typing, enter, up and down, a paste", () => {
    expect(press("a")).toBeUndefined();
    expect(press("")).toBeUndefined();
    expect(press("hello world")).toBeUndefined();
    expect(press("?")).toBeUndefined();
  });
});
