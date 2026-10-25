import { describe, expect, it } from "vitest";
import { contextPercent, layoutStatus, type StatusParts } from "../../src/format/status.js";
import { displayWidth } from "../../src/format/table.js";

const parts: StatusParts = {
  model: "gemini-3.8-flash (google)",
  context: { used: 34_000, budget: 100_000 },
  branch: "main",
  cwd: "~/Project/Cortex",
};

const texts = (width: number, p: StatusParts = parts) => layoutStatus(p, width).map((segment) => segment.text);
const total = (width: number, p: StatusParts = parts) => {
  const segments = layoutStatus(p, width);
  return segments.reduce((sum, segment) => sum + displayWidth(segment.text), 0) + 3 * Math.max(0, segments.length - 1);
};

describe("contextPercent", () => {
  it("is used over budget, rounded", () => {
    expect(contextPercent({ used: 34_000, budget: 100_000 })).toBe(34);
    expect(contextPercent({ used: 1, budget: 3 })).toBe(33);
  });

  it("is capped at 100, since the context can pass the budget for an instant before it is compacted", () => {
    expect(contextPercent({ used: 130_000, budget: 100_000 })).toBe(100);
  });

  it("is 0 for no use or a missing budget", () => {
    expect(contextPercent({ used: 0, budget: 100 })).toBe(0);
    expect(contextPercent({ used: 5, budget: 0 })).toBe(0);
  });
});

describe("layoutStatus", () => {
  it("shows everything, in the order model, context, folder, branch, when there is room", () => {
    expect(layoutStatus(parts, 100)).toEqual([
      { kind: "model", text: "gemini-3.8-flash (google)" },
      { kind: "context", text: "34% context" },
      { kind: "cwd", text: "~/Project/Cortex" },
      { kind: "branch", text: "(main)" },
    ]);
  });

  it("loses the folder first as the terminal narrows, then the branch, then the context", () => {
    // model 25, context 11, branch 6, cwd 16: full = 25 + 11 + 16 + 6 + 9 = 67
    expect(layoutStatus(parts, 67).map((segment) => segment.kind)).toEqual(["model", "context", "cwd", "branch"]);
    expect(layoutStatus(parts, 60).map((segment) => segment.kind)).toEqual(["model", "context", "cwd", "branch"]);
    expect(layoutStatus(parts, 50).map((segment) => segment.kind)).toEqual(["model", "context", "branch"]);
    expect(layoutStatus(parts, 40).map((segment) => segment.kind)).toEqual(["model", "context"]);
    expect(layoutStatus(parts, 30).map((segment) => segment.kind)).toEqual(["model"]);
  });

  it("shortens the folder from its start to use what room is left", () => {
    // model 25 + context 11 + branch 6 and their separators leave 62 - 48 - 3 = 11 columns for the folder
    const rows = layoutStatus(parts, 62);
    expect(rows.find((segment) => segment.kind === "cwd")?.text).toBe("…/Cortex");
    expect(total(62)).toBeLessThanOrEqual(62);

    // one column short of the 8 a folder needs to be worth showing, and it is left out instead
    expect(layoutStatus(parts, 58).some((segment) => segment.kind === "cwd")).toBe(false);
  });

  it("never needs more room than it was given, at any width", () => {
    for (let width = 0; width <= 120; width += 1) {
      const segments = layoutStatus(parts, width);
      expect(segments.length).toBeGreaterThan(0);
      if (width >= 1) expect(total(width)).toBeLessThanOrEqual(width);
    }
  });

  it("cuts a model name that is itself too long, with an ellipsis", () => {
    expect(texts(10)).toEqual(["gemini-3.…"]);
    expect(displayWidth(texts(10)[0]!)).toBe(10);
  });

  it("leaves out what it does not have: no context before the first request, no branch outside a repository", () => {
    expect(layoutStatus({ model: "m", cwd: "~/x" }, 100).map((segment) => segment.kind)).toEqual(["model", "cwd"]);
    expect(layoutStatus({ ...parts, branch: undefined }, 100).map((segment) => segment.kind)).toEqual(["model", "context", "cwd"]);
  });

  it("keeps a context percentage that is already high, so the user can see it", () => {
    expect(texts(100, { ...parts, context: { used: 91_000, budget: 100_000 } })).toContain("91% context");
  });
});
