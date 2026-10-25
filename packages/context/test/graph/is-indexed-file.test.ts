import { describe, expect, it } from "vitest";
import { isIndexedFile } from "../../src/graph/is-indexed-file.js";

describe("isIndexedFile", () => {
  it("accepts source files and package.json at any depth", () => {
    expect(isIndexedFile("src/a.ts")).toBe(true);
    expect(isIndexedFile("package.json")).toBe(true);
    expect(isIndexedFile("packages/shared/package.json")).toBe(true);
  });

  it("rejects other files, including other JSON", () => {
    expect(isIndexedFile("tsconfig.json")).toBe(false);
    expect(isIndexedFile("package-lock.json")).toBe(false);
    expect(isIndexedFile("README.md")).toBe(false);
  });
});
