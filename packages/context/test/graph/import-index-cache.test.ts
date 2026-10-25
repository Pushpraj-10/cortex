import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import {
  clearImportIndexCache,
  getCachedImportIndex,
  setCachedImportIndex,
} from "../../src/graph/import-index-cache.js";
import type { ImportIndex } from "../../src/graph/types.js";

const indexWith = (file: string): ImportIndex => new Map([[file, { mtimeMs: 1, size: 1, specifiers: [] }]]);

describe("import index cache", () => {
  afterEach(() => clearImportIndexCache());

  it("returns undefined for a workspace never cached", () => {
    expect(getCachedImportIndex("/never/seen")).toBeUndefined();
  });

  it("returns what was stored for a workspace", () => {
    const index = indexWith("a.ts");
    setCachedImportIndex("/ws/one", index);
    expect(getCachedImportIndex("/ws/one")).toBe(index);
  });

  it("keeps workspaces separate", () => {
    setCachedImportIndex("/ws/one", indexWith("a.ts"));
    expect(getCachedImportIndex("/ws/two")).toBeUndefined();
  });

  it("treats equivalent spellings of the same root as one workspace", () => {
    const index = indexWith("a.ts");
    setCachedImportIndex(path.join("/ws", "one"), index);
    expect(getCachedImportIndex("/ws/one/")).toBe(index);
    expect(getCachedImportIndex("/ws/other/../one")).toBe(index);
  });

  it("clears one workspace", () => {
    setCachedImportIndex("/ws/one", indexWith("a.ts"));
    setCachedImportIndex("/ws/two", indexWith("b.ts"));

    clearImportIndexCache("/ws/one");

    expect(getCachedImportIndex("/ws/one")).toBeUndefined();
    expect(getCachedImportIndex("/ws/two")).toBeDefined();
  });

  it("clears everything when called with no argument", () => {
    setCachedImportIndex("/ws/one", indexWith("a.ts"));
    setCachedImportIndex("/ws/two", indexWith("b.ts"));

    clearImportIndexCache();

    expect(getCachedImportIndex("/ws/one")).toBeUndefined();
    expect(getCachedImportIndex("/ws/two")).toBeUndefined();
  });
});
