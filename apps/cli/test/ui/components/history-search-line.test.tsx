import React from "react";
import { describe, expect, it } from "vitest";
import { displayWidth } from "../../../src/format/table.js";
import { HistorySearchLine } from "../../../src/ui/components/HistorySearchLine.js";
import { renderFrame } from "../support/render-frame.js";

const draw = (props: { query: string; position?: { current: number; total: number } }, width = 80) =>
  renderFrame(<HistorySearchLine {...props} />, width);

describe("HistorySearchLine", () => {
  it("shows the query, which match this is and how to use it", async () => {
    const line = await draw({ query: "pars", position: { current: 2, total: 5 } });
    expect(line.trimEnd()).toBe(" reverse search: pars  (2/5 · ctrl+r for older · enter to use · esc to cancel)");
  });

  it("says so when nothing matches", async () => {
    const line = await draw({ query: "zzz" });
    expect(line.trimEnd()).toBe(" reverse search: zzz  (no matches · esc to cancel)");
  });

  it("shows just the cursor before anything is typed", async () => {
    const line = await draw({ query: "", position: { current: 1, total: 3 } });
    expect(line.startsWith(" reverse search:  ")).toBe(true);
    expect(line).toContain("(1/3");
  });

  it("is one row that fits at every width, giving up the key hints before the position", async () => {
    const position = { current: 12, total: 48 };
    for (let width = 20; width <= 100; width += 4) {
      const line = await draw({ query: "parser", position }, width);
      expect(line.split("\n"), `width ${width}`).toHaveLength(1);
      expect(displayWidth(line), `width ${width}`).toBeLessThanOrEqual(width);
    }
    expect(await draw({ query: "parser", position }, 100)).toContain("esc to cancel");
    const medium = await draw({ query: "parser", position }, 52);
    expect(medium).toContain("enter to use");
    expect(medium).not.toContain("esc to cancel");
    const narrow = await draw({ query: "parser", position }, 34);
    expect(narrow).toContain("(12/48)");
    expect(narrow).not.toContain("enter");
  });

  it("stays one row even when the query is longer than the terminal is wide", async () => {
    const line = await draw({ query: "x".repeat(100) }, 40);
    expect(line.split("\n")).toHaveLength(1);
    expect(displayWidth(line)).toBeLessThanOrEqual(40);
  });
});
