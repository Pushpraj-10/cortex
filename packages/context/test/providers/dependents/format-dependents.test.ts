import { describe, expect, it } from "vitest";
import { formatDependents } from "../../../src/providers/dependents/format-dependents.js";

describe("formatDependents", () => {
  it("lists direct importers, then each further hop, nearest first", () => {
    const result = formatDependents([
      {
        file: "core.ts",
        dependents: [
          { file: "a.ts", depth: 1 },
          { file: "b.ts", depth: 1 },
          { file: "app.ts", depth: 2 },
          { file: "main.ts", depth: 3 },
        ],
        truncated: false,
      },
    ]);

    expect(result).toBe(
      "core.ts\n  imported by: a.ts, b.ts\n  affected via 2 hops: app.ts\n  affected via 3 hops: main.ts",
    );
  });

  it("notes when the list was capped", () => {
    const result = formatDependents([{ file: "core.ts", dependents: [{ file: "a.ts", depth: 1 }], truncated: true }]);
    expect(result).toBe("core.ts\n  imported by: a.ts\n  (list capped; more files depend on this)");
  });

  it("skips a hop level that has no files", () => {
    const result = formatDependents([{ file: "core.ts", dependents: [{ file: "far.ts", depth: 3 }], truncated: false }]);
    expect(result).toBe("core.ts\n  affected via 3 hops: far.ts");
  });

  it("leaves out files nothing depends on", () => {
    const result = formatDependents([
      { file: "leaf.ts", dependents: [], truncated: false },
      { file: "core.ts", dependents: [{ file: "a.ts", depth: 1 }], truncated: false },
    ]);
    expect(result).toBe("core.ts\n  imported by: a.ts");
  });

  it("separates files with a blank line", () => {
    const result = formatDependents([
      { file: "x.ts", dependents: [{ file: "a.ts", depth: 1 }], truncated: false },
      { file: "y.ts", dependents: [{ file: "b.ts", depth: 1 }], truncated: false },
    ]);
    expect(result).toBe("x.ts\n  imported by: a.ts\n\ny.ts\n  imported by: b.ts");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(formatDependents([])).toBe("");
    expect(formatDependents([{ file: "a.ts", dependents: [], truncated: false }])).toBe("");
  });
});
