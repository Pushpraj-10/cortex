import { describe, expect, it } from "vitest";
import { isSourceFile } from "../../src/graph/is-source-file.js";

describe("isSourceFile", () => {
  it.each(["a.ts", "src/App.tsx", "b.js", "c.jsx", "d.mjs", "e.cjs", "f.mts", "g.cts"])("accepts %s", (file) => {
    expect(isSourceFile(file)).toBe(true);
  });

  it.each(["README.md", "data.json", "style.css", "script.sh", "Makefile", "a.tsx.bak", "ts"])("rejects %s", (file) => {
    expect(isSourceFile(file)).toBe(false);
  });
});
