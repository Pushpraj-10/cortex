import { describe, expect, it } from "vitest";
import { dedupeFragments } from "../../src/core/dedupe-fragments.js";

const fragment = (providerId: string, title: string, content: string) => ({ providerId, title, content });

describe("dedupeFragments", () => {
  it("drops a later fragment with the same title and content, keeping the first", () => {
    const result = dedupeFragments([fragment("a", "T", "same"), fragment("b", "T", "same")]);
    expect(result).toEqual([fragment("a", "T", "same")]);
  });

  it("keeps fragments that differ in title or in content", () => {
    const input = [fragment("a", "T", "one"), fragment("a", "T", "two"), fragment("a", "U", "one")];
    expect(dedupeFragments(input)).toEqual(input);
  });

  it("does not confuse a title/content split with a different one", () => {
    const input = [fragment("a", "ab", "c"), fragment("a", "a", "bc")];
    expect(dedupeFragments(input)).toEqual(input);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeFragments([])).toEqual([]);
  });
});
