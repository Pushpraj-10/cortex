import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { moveFileTool } from "../../src/file-system/move-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("moveFileTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(moveFileTool.name).toBe("move_file");
    expect(moveFileTool.description).toContain("Move");
    expect(moveFileTool.parametersSchema).toHaveProperty("properties.from");
    expect(moveFileTool.parametersSchema).toHaveProperty("properties.to");
  });

  it("moves file to new location", async () => {
    const fromPath = path.join(tempDir, "original.txt");
    const toPath = path.join(tempDir, "moved.txt");
    const content = "file content";
    await fs.writeFile(fromPath, content, "utf-8");

    const result = await moveFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const fromExists = await fs.access(fromPath).then(() => true).catch(() => false);
    expect(fromExists).toBe(false);

    const toContent = await fs.readFile(toPath, "utf-8");
    expect(toContent).toBe(content);
  });

  it("renames file", async () => {
    const fromPath = path.join(tempDir, "old.txt");
    const toPath = path.join(tempDir, "new.txt");
    await fs.writeFile(fromPath, "content", "utf-8");

    const result = await moveFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(true);

    const newExists = await fs.access(toPath).then(() => true).catch(() => false);
    expect(newExists).toBe(true);
  });

  it("creates destination directory if needed", async () => {
    const fromPath = path.join(tempDir, "file.txt");
    const toPath = path.join(tempDir, "newdir", "subdir", "file.txt");
    await fs.writeFile(fromPath, "content", "utf-8");

    const result = await moveFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(toPath, "utf-8");
    expect(toContent).toBe("content");
  });

  it("returns error when source file does not exist", async () => {
    const fromPath = path.join(tempDir, "nonexistent.txt");
    const toPath = path.join(tempDir, "target.txt");

    const result = await moveFileTool.handler({ from: fromPath, to: toPath }, context);

    expect(result.ok).toBe(false);
  });
});
