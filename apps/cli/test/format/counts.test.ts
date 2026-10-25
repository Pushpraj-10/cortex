import { describe, expect, it } from "vitest";
import { estimateTokensFromChars, formatTokenCount } from "../../src/format/counts.js";

describe("estimateTokensFromChars", () => {
  it("is about one token per four characters, rounded up", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(4)).toBe(1);
    expect(estimateTokensFromChars(5)).toBe(2);
    expect(estimateTokensFromChars(4000)).toBe(1000);
  });

  it("treats a negative count as zero", () => {
    expect(estimateTokensFromChars(-10)).toBe(0);
  });
});

describe("formatTokenCount", () => {
  it("shows small counts as they are", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(7)).toBe("7");
    expect(formatTokenCount(340)).toBe("340");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("shows thousands with one decimal up to 10k, and whole thousands after", () => {
    expect(formatTokenCount(1000)).toBe("1.0k");
    expect(formatTokenCount(1234)).toBe("1.2k");
    expect(formatTokenCount(9949)).toBe("9.9k");
    expect(formatTokenCount(12_345)).toBe("12k");
    expect(formatTokenCount(98_600)).toBe("99k");
  });

  it("never shows 10.0k or 1000k: a count that rounds up moves to the next unit", () => {
    expect(formatTokenCount(9960)).toBe("10k");
    expect(formatTokenCount(999_600)).toBe("1.0M");
  });

  it("shows millions with one decimal", () => {
    expect(formatTokenCount(1_000_000)).toBe("1.0M");
    expect(formatTokenCount(2_460_000)).toBe("2.5M");
  });

  it("treats a negative count as zero", () => {
    expect(formatTokenCount(-5)).toBe("0");
  });
});
