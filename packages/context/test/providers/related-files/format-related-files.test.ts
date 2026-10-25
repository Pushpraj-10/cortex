import { describe, expect, it } from "vitest";
import { formatRelatedFiles } from "../../../src/providers/related-files/format-related-files.js";

describe("formatRelatedFiles", () => {
  it("lists a file's imports and tests", () => {
    const result = formatRelatedFiles([
      { file: "src/a.ts", imports: ["src/b.ts", "src/c.ts"], tests: ["test/a.test.ts"] },
    ]);

    expect(result).toBe("src/a.ts\n  imports: src/b.ts, src/c.ts\n  tests: test/a.test.ts");
  });

  it("omits the line for a part that is empty", () => {
    expect(formatRelatedFiles([{ file: "a.ts", imports: ["b.ts"], tests: [] }])).toBe("a.ts\n  imports: b.ts");
    expect(formatRelatedFiles([{ file: "a.ts", imports: [], tests: ["a.test.ts"] }])).toBe("a.ts\n  tests: a.test.ts");
  });

  it("leaves out files with neither imports nor tests", () => {
    const result = formatRelatedFiles([
      { file: "empty.ts", imports: [], tests: [] },
      { file: "a.ts", imports: ["b.ts"], tests: [] },
    ]);
    expect(result).toBe("a.ts\n  imports: b.ts");
  });

  it("separates files with a blank line", () => {
    const result = formatRelatedFiles([
      { file: "a.ts", imports: ["x.ts"], tests: [] },
      { file: "b.ts", imports: ["y.ts"], tests: [] },
    ]);
    expect(result).toBe("a.ts\n  imports: x.ts\n\nb.ts\n  imports: y.ts");
  });

  it("caps a long import list and says how many were left off", () => {
    const imports = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    const result = formatRelatedFiles([{ file: "a.ts", imports, tests: [] }]);
    expect(result).toContain("f14.ts, … (5 more)");
    expect(result).not.toContain("f15.ts");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(formatRelatedFiles([])).toBe("");
    expect(formatRelatedFiles([{ file: "a.ts", imports: [], tests: [] }])).toBe("");
  });
});
