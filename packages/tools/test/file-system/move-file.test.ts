import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { moveFileTool } from "../../src/file-system/move-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("moveFileTool", () => {
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
    expect(moveFileTool.name).toBe("move_file");
    expect(moveFileTool.description).toContain("Move");
    expect(moveFileTool.parametersSchema).toHaveProperty("properties.from");
    expect(moveFileTool.parametersSchema).toHaveProperty("properties.to");
  });

  it("moves file to new location", async () => {
    const content = "file content";
    await fs.writeFile(path.join(tempDir, "original.txt"), content, "utf-8");

    const result = await moveFileTool.handler({ from: "original.txt", to: "moved.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const fromExists = await fs
      .access(path.join(tempDir, "original.txt"))
      .then(() => true)
      .catch(() => false);
    expect(fromExists).toBe(false);

    const toContent = await fs.readFile(path.join(tempDir, "moved.txt"), "utf-8");
    expect(toContent).toBe(content);
  });

  it("renames file", async () => {
    await fs.writeFile(path.join(tempDir, "old.txt"), "content", "utf-8");

    const result = await moveFileTool.handler({ from: "old.txt", to: "new.txt" }, context);

    expect(result.ok).toBe(true);

    const newExists = await fs
      .access(path.join(tempDir, "new.txt"))
      .then(() => true)
      .catch(() => false);
    expect(newExists).toBe(true);
  });

  it("creates destination directory if needed", async () => {
    await fs.writeFile(path.join(tempDir, "file.txt"), "content", "utf-8");

    const result = await moveFileTool.handler({ from: "file.txt", to: "newdir/subdir/file.txt" }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(path.join(tempDir, "newdir", "subdir", "file.txt"), "utf-8");
    expect(toContent).toBe("content");
  });

  it("returns error when source file does not exist", async () => {
    const result = await moveFileTool.handler({ from: "nonexistent.txt", to: "target.txt" }, context);

    expect(result.ok).toBe(false);
  });

  it("rejects a from/to path that escapes the workspace root", async () => {
    const result = await moveFileTool.handler({ from: "../outside.txt", to: "target.txt" }, context);
    expect(result.ok).toBe(false);
  });
});
