import { describe, expect, it } from "vitest";
import { rankFragments } from "../../src/core/rank-fragments.js";

const fragment = (title: string, relevance?: number) => ({ providerId: "p", title, content: "c", relevance });

describe("rankFragments", () => {
  it("orders by relevance, highest first", () => {
    const result = rankFragments([fragment("low", 0.1), fragment("high", 1), fragment("mid", 0.5)]);
    expect(result.map((f) => f.title)).toEqual(["high", "mid", "low"]);
  });

  it("treats a missing relevance as 0", () => {
    const result = rankFragments([fragment("none"), fragment("some", 0.2)]);
    expect(result.map((f) => f.title)).toEqual(["some", "none"]);
  });

  it("keeps incoming order among equal relevance", () => {
    const result = rankFragments([fragment("first", 0.5), fragment("second", 0.5), fragment("third", 0.5)]);
    expect(result.map((f) => f.title)).toEqual(["first", "second", "third"]);
  });

  it("does not mutate its input", () => {
    const input = [fragment("low", 0.1), fragment("high", 1)];
    rankFragments(input);
    expect(input.map((f) => f.title)).toEqual(["low", "high"]);
  });
});
