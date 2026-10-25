import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveMentionedFiles } from "../../src/workspace/resolve-mentioned-files.js";

describe("resolveMentionedFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "x");
  }

  it("resolves an exact relative path", async () => {
    await write("src/a.ts");
    expect(await resolveMentionedFiles(tempDir, ["src/a.ts"])).toEqual(["src/a.ts"]);
  });

  it("resolves a bare filename that is unique in the workspace", async () => {
    await write("packages/agent/src/tool-loop.ts");
    expect(await resolveMentionedFiles(tempDir, ["tool-loop.ts"])).toEqual(["packages/agent/src/tool-loop.ts"]);
  });

  it("resolves a partial path by its trailing segments", async () => {
    await write("packages/agent/src/core/tool-loop.ts");
    await write("packages/other/tool-loop.ts");
    expect(await resolveMentionedFiles(tempDir, ["core/tool-loop.ts"])).toEqual([
      "packages/agent/src/core/tool-loop.ts",
    ]);
  });

  it("prefers the exact root-level file over same-named files elsewhere", async () => {
    await write("package.json");
    await write("packages/a/package.json");
    expect(await resolveMentionedFiles(tempDir, ["package.json"])).toEqual(["package.json"]);
  });

  it("skips an ambiguous bare filename", async () => {
    await write("a/index.ts");
    await write("b/index.ts");
    expect(await resolveMentionedFiles(tempDir, ["index.ts"])).toEqual([]);
  });

  it("skips files that do not exist", async () => {
    expect(await resolveMentionedFiles(tempDir, ["nope.ts", "also/missing.ts"])).toEqual([]);
  });

  it("skips a mention that escapes the workspace", async () => {
    expect(await resolveMentionedFiles(tempDir, ["../outside.ts"])).toEqual([]);
  });

  it("skips directories", async () => {
    await write("src/a.ts");
    expect(await resolveMentionedFiles(tempDir, ["src"])).toEqual([]);
  });

  it("returns each file once", async () => {
    await write("a.ts");
    expect(await resolveMentionedFiles(tempDir, ["a.ts", "a.ts"])).toEqual(["a.ts"]);
  });

  it("caps the number of files", async () => {
    for (const name of ["a.ts", "b.ts", "c.ts", "d.ts"]) await write(name);
    expect(await resolveMentionedFiles(tempDir, ["a.ts", "b.ts", "c.ts", "d.ts"])).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(await resolveMentionedFiles(tempDir, ["a.ts", "b.ts"], { maxFiles: 1 })).toEqual(["a.ts"]);
  });
});
