import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { copyFileTool } from "../../src/file-system/copy-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("copyFileTool", () => {
  let tempDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    context = { cwd: tempDir };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(copyFileTool.name).toBe("copy_file");
    expect(copyFileTool.description).toContain("Copy");
    expect(copyFileTool.parametersSchema).toHaveProperty("properties.from");
    expect(copyFileTool.parametersSchema).toHaveProperty("properties.to");
  });

  it("copies file to new location", async () => {
    const content = "file content";
    await fs.writeFile(path.join(tempDir, "original.txt"), content, "utf-8");

    const result = await copyFileTool.handler({ from: "original.txt", to: "copy.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const fromContent = await fs.readFile(path.join(tempDir, "original.txt"), "utf-8");
    expect(fromContent).toBe(content);

    const toContent = await fs.readFile(path.join(tempDir, "copy.txt"), "utf-8");
    expect(toContent).toBe(content);
  });

  it("creates destination directory if needed", async () => {
    const content = "content";
    await fs.writeFile(path.join(tempDir, "file.txt"), content, "utf-8");

    const result = await copyFileTool.handler({ from: "file.txt", to: "newdir/subdir/file.txt" }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(path.join(tempDir, "newdir", "subdir", "file.txt"), "utf-8");
    expect(toContent).toBe(content);
  });

  it("overwrites destination file if it exists", async () => {
    await fs.writeFile(path.join(tempDir, "source.txt"), "new content", "utf-8");
    await fs.writeFile(path.join(tempDir, "target.txt"), "old content", "utf-8");

    const result = await copyFileTool.handler({ from: "source.txt", to: "target.txt" }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(path.join(tempDir, "target.txt"), "utf-8");
    expect(toContent).toBe("new content");
  });

  it("returns error when source file does not exist", async () => {
    const result = await copyFileTool.handler({ from: "nonexistent.txt", to: "target.txt" }, context);

    expect(result.ok).toBe(false);
  });

  it("rejects a from/to path that escapes the workspace root", async () => {
    const result = await copyFileTool.handler({ from: "../outside.txt", to: "target.txt" }, context);
    expect(result.ok).toBe(false);
  });
});
