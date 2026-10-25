import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isFileInWorkspace } from "../../src/workspace/is-file-in-workspace.js";

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
