import { describe, expect, it } from "vitest";
import { edgeKeyOf, editFor, isMouseReport, mentionMenuAction, wheelRowsOf, type EditingKey, type MenuKey } from "../../../src/ui/hooks/keys.js";

const noMenuKey: MenuKey = { upArrow: false, downArrow: false, tab: false, return: false, escape: false, shift: false, meta: false };
const menuKey = (flags: Partial<MenuKey>, query = "src") => mentionMenuAction({ ...noMenuKey, ...flags }, query);

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

describe("mentionMenuAction", () => {
  it("moves the highlight with up and down", () => {
    expect(menuKey({ upArrow: true })).toBe("previous");
    expect(menuKey({ downArrow: true })).toBe("next");
  });

  it("picks the highlighted file with tab, whatever has been typed", () => {
    expect(menuKey({ tab: true })).toBe("accept");
    expect(menuKey({ tab: true }, "")).toBe("accept");
  });

  it("picks it with enter once something is typed after the @", () => {
    expect(menuKey({ return: true }, "s")).toBe("accept");
  });

  it("leaves enter alone after a bare @, so a message like 'meet @ 5pm' can still be sent", () => {
    expect(menuKey({ return: true }, "")).toBeUndefined();
  });

  it("leaves shift+enter and alt+enter to start a new line", () => {
    expect(menuKey({ return: true, shift: true })).toBeUndefined();
    expect(menuKey({ return: true, meta: true })).toBeUndefined();
  });

  it("closes the menu with escape", () => {
    expect(menuKey({ escape: true })).toBe("dismiss");
  });

  it("lets everything else through, so typing narrows the list", () => {
    expect(menuKey({})).toBeUndefined();
  });
});

describe("wheelRowsOf", () => {
  const report = (button: number, suffix = "M") => `\u001b[<${button};10;5${suffix}`;

  it("counts a wheel notch up as +1 and down as -1", () => {
    expect(wheelRowsOf(report(64))).toBe(1);
    expect(wheelRowsOf(report(65))).toBe(-1);
  });

  it("still reads a notch made with shift, alt or ctrl held", () => {
    expect(wheelRowsOf(report(64 + 4))).toBe(1);
    expect(wheelRowsOf(report(65 + 16))).toBe(-1);
  });

  it("adds up several notches that arrive in one chunk", () => {
    expect(wheelRowsOf(report(64) + report(64) + report(65))).toBe(1);
  });

  it("ignores clicks, drags, releases and ordinary keys", () => {
    expect(wheelRowsOf(report(0))).toBe(0);
    expect(wheelRowsOf(report(0, "m"))).toBe(0);
    expect(wheelRowsOf(report(32))).toBe(0);
    expect(wheelRowsOf("hello")).toBe(0);
  });
});

describe("isMouseReport", () => {
  it("recognises a report as Ink hands it to useInput, without the leading escape", () => {
    expect(isMouseReport("[<64;10;5M")).toBe(true);
    expect(isMouseReport("[<0;3;4m")).toBe(true);
  });

  it("does not take typed text for one", () => {
    expect(isMouseReport("[<")).toBe(false);
    expect(isMouseReport("hello")).toBe(false);
  });
});
