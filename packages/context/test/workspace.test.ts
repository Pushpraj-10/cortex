import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isFileInWorkspace, walkWorkspace, readFileExcerpt, extractFileMentions, resolveMentionedFiles, findRelatedTests, resolveRequestMentions } from "../src/workspace.js";

describe("isFileInWorkspace", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("is true for an existing file", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "x");
    expect(await isFileInWorkspace(tempDir, "a.ts")).toBe(true);
  });

  it("is false for a directory", async () => {
    await fs.mkdir(path.join(tempDir, "src"));
    expect(await isFileInWorkspace(tempDir, "src")).toBe(false);
  });

  it("is false for a missing file", async () => {
    expect(await isFileInWorkspace(tempDir, "missing.ts")).toBe(false);
  });

  it("is false for a path that escapes the workspace or is absolute", async () => {
    expect(await isFileInWorkspace(tempDir, "../x.ts")).toBe(false);
    expect(await isFileInWorkspace(tempDir, path.join(tempDir, "x.ts"))).toBe(false);
  });
});

describe("walkWorkspace", () => {
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

  it("lists files as slash-separated relative paths, nested ones included", async () => {
    await write("a.txt");
    await write("src/core/b.ts");

    const files = await walkWorkspace(tempDir);

    expect([...files].sort()).toEqual(["a.txt", "src/core/b.ts"]);
  });

  it("skips ignored directories", async () => {
    await write("keep.ts");
    await write("node_modules/dep/index.js");
    await write(".git/config");
    await write("dist/out.js");

    expect(await walkWorkspace(tempDir)).toEqual(["keep.ts"]);
  });

  it("lists shallow files before deep ones", async () => {
    await write("a/b/c/deep.ts");
    await write("top.ts");

    const files = await walkWorkspace(tempDir);

    expect(files).toEqual(["top.ts", "a/b/c/deep.ts"]);
  });

  it("does not enter directories deeper than maxDepth", async () => {
    await write("one.ts");
    await write("a/two.ts");
    await write("a/b/three.ts");

    const files = await walkWorkspace(tempDir, { maxDepth: 1 });

    expect([...files].sort()).toEqual(["a/two.ts", "one.ts"]);
  });

  it("stops at maxEntries", async () => {
    for (let i = 0; i < 5; i += 1) await write(`f${i}.ts`);

    expect(await walkWorkspace(tempDir, { maxEntries: 3 })).toHaveLength(3);
  });

  it("returns an empty list when the root does not exist", async () => {
    expect(await walkWorkspace(path.join(tempDir, "missing"))).toEqual([]);
  });
});

describe("readFileExcerpt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns the whole file when it fits", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "const a = 1;\n");

    const result = await readFileExcerpt(tempDir, "a.ts");

    expect(result.ok && result.value).toBe("const a = 1;\n");
  });

  it("truncates a long file and says so", async () => {
    await fs.writeFile(path.join(tempDir, "big.ts"), "x".repeat(100));

    const result = await readFileExcerpt(tempDir, "big.ts", 10);

    expect(result.ok && result.value).toBe("x".repeat(10) + "\n… [file truncated]");
  });

  it("returns an error Result for a missing file", async () => {
    const result = await readFileExcerpt(tempDir, "missing.ts");
    expect(result.ok).toBe(false);
  });

  it("returns an error Result for a path outside the workspace", async () => {
    const result = await readFileExcerpt(tempDir, "../secret.txt");
    expect(result.ok).toBe(false);
  });

  it("returns an error Result for a binary file", async () => {
    await fs.writeFile(path.join(tempDir, "image.bin"), Buffer.from([0x89, 0x00, 0x01]));

    const result = await readFileExcerpt(tempDir, "image.bin");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("binary");
  });
});

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

describe("findRelatedTests", () => {
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

  it("finds a sibling .test file", async () => {
    await write("src/a.ts");
    await write("src/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/a.test.ts"]);
  });

  it("finds a sibling .spec file", async () => {
    await write("src/a.ts");
    await write("src/a.spec.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/a.spec.ts"]);
  });

  it("finds a test in a sibling __tests__ directory", async () => {
    await write("src/a.ts");
    await write("src/__tests__/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/__tests__/a.test.ts"]);
  });

  it("finds a test in a package-level test/ tree that mirrors src/", async () => {
    await write("packages/agent/src/core/tool-loop.ts");
    await write("packages/agent/test/core/tool-loop.test.ts");
    expect(await findRelatedTests(tempDir, "packages/agent/src/core/tool-loop.ts")).toEqual([
      "packages/agent/test/core/tool-loop.test.ts",
    ]);
  });

  it("finds a mirrored test when src/ is at the workspace root", async () => {
    await write("src/core/a.ts");
    await write("test/core/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/core/a.ts")).toEqual(["test/core/a.test.ts"]);
  });

  it("finds a test in a tests/ tree", async () => {
    await write("src/a.ts");
    await write("tests/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["tests/a.test.ts"]);
  });

  it("returns every match when there are several", async () => {
    await write("src/a.ts");
    await write("src/a.test.ts");
    await write("test/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/a.test.ts", "test/a.test.ts"]);
  });

  it("returns nothing when the file has no tests", async () => {
    await write("src/a.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual([]);
  });

  it("returns nothing for a file that is itself a test", async () => {
    await write("src/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.test.ts")).toEqual([]);
  });
});

describe("resolveRequestMentions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    await fs.writeFile(path.join(tempDir, "a.ts"), "export {};");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("resolves the files a request names", async () => {
    const request = { workspaceRoot: tempDir, userMessage: "please fix a.ts" };
    expect(await resolveRequestMentions(request)).toEqual(["a.ts"]);
  });

  it("shares one resolution between callers on the same request object", async () => {
    const request = { workspaceRoot: tempDir, userMessage: "please fix a.ts" };
    expect(resolveRequestMentions(request)).toBe(resolveRequestMentions(request));
  });

  it("resolves a different request object independently", async () => {
    const first = { workspaceRoot: tempDir, userMessage: "please fix a.ts" };
    const second = { workspaceRoot: tempDir, userMessage: "please fix a.ts" };
    expect(resolveRequestMentions(first)).not.toBe(resolveRequestMentions(second));
  });
});
