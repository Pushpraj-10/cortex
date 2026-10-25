import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { walkWorkspace } from "../../src/workspace/walk-workspace.js";

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
