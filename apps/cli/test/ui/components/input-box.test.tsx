import React from "react";
import { describe, expect, it } from "vitest";
import { InputBox } from "../../../src/ui/components/InputBox.js";
import { inputTextRows } from "../../../src/ui/layout.js";
import { maskValue } from "../../../src/provider/setup.js";
import { renderFrame } from "../support/render-frame.js";

const WIDTH = 40;
const rule = "─".repeat(WIDTH);
const PLACEHOLDER = 'Try "fix lint errors"';

const draw = async (value: string, cursorOffset = value.length, extra: { mask?: boolean } = {}) =>
  (await renderFrame(<InputBox value={value} cursorOffset={cursorOffset} placeholder={PLACEHOLDER} {...extra} />, WIDTH)).split("\n");

describe("InputBox", () => {
  it("is a rule above and below with nothing at the sides, and a grey prompt between", async () => {
    expect(await draw("")).toEqual([rule, ` > ${PLACEHOLDER}`, rule]);
  });

  it("shows what is typed after the prompt, wherever the cursor is", async () => {
    expect(await draw("hello")).toEqual([rule, " > hello", rule]);
    expect(await draw("hello", 2)).toEqual([rule, " > hello", rule]);
    expect(await draw("hello", 0)).toEqual([rule, " > hello", rule]);
  });

  it("keeps later lines aligned under the first, without a second prompt", async () => {
    expect(await draw("one\ntwo\nthree")).toEqual([rule, " > one", "   two", "   three", rule]);
  });

  it("shows a dot per character for a secret, never the text", async () => {
    const rows = (await draw("secret-key", 10, { mask: true })).join("\n");
    expect(rows).toContain(maskValue("secret-key"));
    expect(rows).not.toContain("secret");
  });

  it("shows only the last ten lines of a long entry, and keeps the prompt on the first of them", async () => {
    const rows = await draw(Array.from({ length: 15 }, (_, i) => `l${i + 1}`).join("\n"));
    expect(rows).toHaveLength(10 + 2);
    expect(rows[1]).toBe(" > l6");
    expect(rows[2]).toBe("   l7");
    expect(rows[10]).toBe("   l15");
  });

  it.each(["", "a", "a\nb", "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl"])("takes exactly the rows the layout reserves (%j)", async (value) => {
    expect(await draw(value)).toHaveLength(inputTextRows(value) + 2);
  });

  it("draws the rules the full width of the terminal", async () => {
    const rows = await draw("x");
    expect(rows[0]).toHaveLength(WIDTH);
    expect(rows[rows.length - 1]).toHaveLength(WIDTH);
  });
});
