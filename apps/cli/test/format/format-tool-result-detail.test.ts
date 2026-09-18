import { describe, expect, it } from "vitest";
import { formatToolResultDetail } from "../../src/format/format-tool-result-detail.js";

describe("formatToolResultDetail", () => {
  it("pretty-prints an object", () => {
    expect(formatToolResultDetail({ success: true })).toBe('{\n  "success": true\n}');
  });

  it("passes a string through unchanged", () => {
    expect(formatToolResultDetail("plain text")).toBe("plain text");
  });

  it("truncates output past the max length", () => {
    const longString = "x".repeat(3000);
    const result = formatToolResultDetail(longString);
    expect(result.length).toBeLessThan(3000);
    expect(result.endsWith("… (truncated)")).toBe(true);
  });

  it("does not truncate output at or under the max length", () => {
    const content = "x".repeat(100);
    expect(formatToolResultDetail(content)).toBe(content);
  });
});
