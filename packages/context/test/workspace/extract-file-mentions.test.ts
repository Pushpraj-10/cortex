import { describe, expect, it } from "vitest";
import { extractFileMentions } from "../../src/workspace/extract-file-mentions.js";

describe("extractFileMentions", () => {
  it("finds a path mentioned in prose", () => {
    expect(extractFileMentions("please fix packages/agent/src/core/tool-loop.ts for me")).toEqual([
      "packages/agent/src/core/tool-loop.ts",
    ]);
  });

  it("finds a bare filename", () => {
    expect(extractFileMentions("what does tool-loop.ts do?")).toEqual(["tool-loop.ts"]);
  });

  it("finds files in backticks and ignores trailing punctuation", () => {
    expect(extractFileMentions("look at `src/index.ts`, then package.json.")).toEqual(["src/index.ts", "package.json"]);
  });

  it("finds several files in order, without duplicates", () => {
    expect(extractFileMentions("compare a.ts with b.ts and then a.ts again")).toEqual(["a.ts", "b.ts"]);
  });

  it("strips a leading ./ and normalises backslashes", () => {
    expect(extractFileMentions("open ./src/a.ts and src\\b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("does not cut a longer extension short", () => {
    expect(extractFileMentions("edit App.tsx and config.json")).toEqual(["App.tsx", "config.json"]);
  });

  it("ignores prose that merely contains dots", () => {
    expect(extractFileMentions("e.g. version 1.2.3, see example.com or v2.0")).toEqual([]);
  });

  it("ignores URLs and absolute paths", () => {
    expect(extractFileMentions("see https://example.com/docs/readme.md and /etc/hosts.txt")).toEqual([]);
  });

  it("returns nothing for a message with no file", () => {
    expect(extractFileMentions("hello there")).toEqual([]);
  });

  it("caps how many mentions it returns", () => {
    const many = Array.from({ length: 30 }, (_, i) => `f${i}.ts`).join(" ");
    expect(extractFileMentions(many)).toHaveLength(10);
  });
});
