import React from "react";
import { describe, expect, it } from "vitest";
import { displayWidth } from "../../../src/format/table.js";
import { ThinkingIndicator } from "../../../src/ui/components/ThinkingIndicator.js";
import { renderFrame } from "../support/render-frame.js";

const draw = (props: { active?: boolean; outputChars?: number }) => renderFrame(<ThinkingIndicator active={props.active ?? true} outputChars={props.outputChars} />, 80);

describe("ThinkingIndicator", () => {
  it("shows a spinner, a verb, the elapsed time and how to interrupt, while the agent works", async () => {
    const line = await draw({});
    expect(line).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] (Thinking|Pondering|Working|Reasoning|Mulling)… \(\d+s · esc to interrupt\)$/);
  });

  it("shows nothing when the agent is idle", async () => {
    expect(await draw({ active: false })).toBe("");
  });

  it("adds a rough count of the tokens written so far once text is streaming in", async () => {
    expect(await draw({ outputChars: 1000 })).toMatch(/\(\d+s · ↓ 250 tokens · esc to interrupt\)$/);
    expect(await draw({ outputChars: 4800 })).toMatch(/↓ 1\.2k tokens/);
    expect(await draw({ outputChars: 3 })).toMatch(/↓ 1 tokens/);
  });

  it("is exactly one row at every terminal width, giving up details from the least important", async () => {
    const at = (columns: number) => renderFrame(<ThinkingIndicator active outputChars={5400} />, columns);
    for (let width = 12; width <= 100; width += 4) {
      const line = await at(width);
      expect(line.split("\n"), `width ${width}`).toHaveLength(1);
      expect(displayWidth(line), `width ${width}`).toBeLessThanOrEqual(width);
    }
    expect(await at(100)).toContain("esc to interrupt");
    expect(await at(40)).not.toContain("esc to interrupt");
    expect(await at(40)).toContain("tokens");
    expect(await at(24)).not.toContain("tokens");
    expect(await at(24)).toMatch(/\(\d+s\)/);
  });

  it("shows no count before any text has arrived", async () => {
    expect(await draw({ outputChars: 0 })).not.toContain("↓");
    expect(await draw({})).not.toContain("tokens");
  });
});
