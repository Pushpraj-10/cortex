import { describe, expect, it } from "vitest";
import { applyBudget } from "../../src/core/apply-budget.js";
import { renderContextBlock } from "../../src/core/render-context-block.js";

const fragment = (title: string, content: string) => ({ providerId: "p", title, content });

describe("applyBudget", () => {
  it("returns everything untouched when it fits", () => {
    const input = [fragment("A", "aaa"), fragment("B", "bbb")];
    expect(applyBudget(input, 1000)).toEqual(input);
  });

  it("truncates the fragment that crosses the budget and drops everything after it", () => {
    const input = [fragment("A", "a".repeat(100)), fragment("B", "b".repeat(500)), fragment("C", "c".repeat(10))];

    const result = applyBudget(input, 400);

    expect(result[0]).toEqual(input[0]);
    expect(result[1]?.title).toBe("B");
    expect(result[1]?.content.endsWith("[truncated]")).toBe(true);
    expect(result[1]?.content.length).toBeLessThan(500);
    expect(result.some((f) => f.title === "C")).toBe(false);
  });

  it("keeps the rendered block within the budget, ignoring only the omitted-note", () => {
    const input = [fragment("A", "a".repeat(300)), fragment("B", "b".repeat(300))];

    const result = applyBudget(input, 450);
    const withoutNote = result.filter((f) => f.providerId !== "context");

    expect(renderContextBlock(withoutNote).length).toBeLessThanOrEqual(450 + "# Workspace Context\n\n".length);
  });

  it("adds a note saying how many sections were left out", () => {
    const input = [fragment("A", "a".repeat(300)), fragment("B", "b"), fragment("C", "c")];

    const result = applyBudget(input, 310);

    const note = result[result.length - 1];
    expect(note?.title).toBe("Omitted context");
    expect(note?.content).toContain("2 lower-priority");
  });

  it("drops (rather than truncates) a fragment when too little of it would survive", () => {
    const input = [fragment("A", "a".repeat(100)), fragment("B", "b".repeat(500))];

    const result = applyBudget(input, 120);

    expect(result.map((f) => f.title)).toEqual(["A", "Omitted context"]);
  });

  it("adds no note when nothing was dropped", () => {
    expect(applyBudget([fragment("A", "a")], 1000).some((f) => f.title === "Omitted context")).toBe(false);
  });

  it("returns an empty array for empty input", () => {
    expect(applyBudget([], 100)).toEqual([]);
  });
});
