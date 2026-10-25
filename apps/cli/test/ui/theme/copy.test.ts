import { describe, expect, it } from "vitest";
import { pickPlaceholder, pickTip, placeholderExamples, tips } from "../../../src/ui/theme/copy.js";

describe("pickTip", () => {
  it("picks by the random number: the first tip at 0 and the last just below 1", () => {
    expect(pickTip(() => 0)).toBe(tips[0]);
    expect(pickTip(() => 0.999999)).toBe(tips[tips.length - 1]);
  });

  it("never runs off the end, even for a random source that returns exactly 1", () => {
    expect(pickTip(() => 1)).toBe(tips[tips.length - 1]);
  });

  it("picks a tip from the list by default", () => {
    expect(tips).toContain(pickTip());
  });
});

describe("tips", () => {
  it("are non-empty single lines", () => {
    expect(tips.length).toBeGreaterThan(0);
    for (const tip of tips) {
      expect(tip.trim()).not.toBe("");
      expect(tip).not.toContain("\n");
    }
  });
});

describe("pickPlaceholder", () => {
  it("phrases an example as Try \"...\", the way an empty prompt invites", () => {
    expect(pickPlaceholder(() => 0)).toBe(`Try "${placeholderExamples[0]}"`);
    expect(pickPlaceholder(() => 0.999999)).toBe(`Try "${placeholderExamples[placeholderExamples.length - 1]}"`);
  });

  it("never runs off the end", () => {
    expect(pickPlaceholder(() => 1)).toBe(`Try "${placeholderExamples[placeholderExamples.length - 1]}"`);
  });

  it("always yields a single quoted line", () => {
    for (const example of placeholderExamples) expect(example).not.toContain("\n");
    expect(pickPlaceholder()).toMatch(/^Try ".+"$/);
  });
});
