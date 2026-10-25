import { describe, expect, it } from "vitest";
import { formatToolError } from "../../src/agent/format-tool-error";

describe("formatToolError", () => {
  it("adds a recovery hint for known failure causes", () => {
    const out = formatToolError(new Error("ENOENT: no such file or directory, open 'x'"));
    expect(out).toContain("ENOENT");
    expect(out).toContain("Hint: ");
    expect(out).toContain("Glob");
  });

  it("passes unknown errors through unchanged, including non-Error values", () => {
    expect(formatToolError(new Error("boom"))).toBe("boom");
    expect(formatToolError("plain")).toBe("plain");
  });
});
