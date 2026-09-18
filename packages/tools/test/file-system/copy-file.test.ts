import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { copyFileTool } from "../../src/file-system/copy-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("copyFileTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
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
    const fromPath = path.join(tempDir, "original.txt");
    const toPath = path.join(tempDir, "copy.txt");
    const content = "file content";
    await fs.writeFile(fromPath, content, "utf-8");

    const result = await copyFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const fromContent = await fs.readFile(fromPath, "utf-8");
    expect(fromContent).toBe(content);

    const toContent = await fs.readFile(toPath, "utf-8");
    expect(toContent).toBe(content);
  });

  it("creates destination directory if needed", async () => {
    const fromPath = path.join(tempDir, "file.txt");
    const toPath = path.join(tempDir, "newdir", "subdir", "file.txt");
    const content = "content";
    await fs.writeFile(fromPath, content, "utf-8");

    const result = await copyFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(toPath, "utf-8");
    expect(toContent).toBe(content);
  });

  it("overwrites destination file if it exists", async () => {
    const fromPath = path.join(tempDir, "source.txt");
    const toPath = path.join(tempDir, "target.txt");
    await fs.writeFile(fromPath, "new content", "utf-8");
    await fs.writeFile(toPath, "old content", "utf-8");

    const result = await copyFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(toPath, "utf-8");
    expect(toContent).toBe("new content");
  });

  it("returns error when source file does not exist", async () => {
    const fromPath = path.join(tempDir, "nonexistent.txt");
    const toPath = path.join(tempDir, "target.txt");

    const result = await copyFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(false);
  });
});
