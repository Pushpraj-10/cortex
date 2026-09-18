import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { writeFileTool } from "../../src/file-system/write-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("writeFileTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(writeFileTool.name).toBe("write_file");
    expect(writeFileTool.description).toContain("Create");
    expect(writeFileTool.parametersSchema).toHaveProperty("properties.path");
    expect(writeFileTool.parametersSchema).toHaveProperty("properties.content");
  });

  it("writes file contents successfully", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const content = "Hello, World!";

    const result = await writeFileTool.handler({ path: filePath, content }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("overwrites existing files", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "old content", "utf-8");

    const newContent = "new content";
    const result = await writeFileTool.handler({ path: filePath, content: newContent }, context);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(newContent);
  });

  it("creates parent directories if needed", async () => {
    const filePath = path.join(tempDir, "subdir", "nested", "file.txt");
    const content = "nested file";

    const result = await writeFileTool.handler({ path: filePath, content }, context);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });

  it("handles UTF-8 content", async () => {
    const filePath = path.join(tempDir, "unicode.txt");
    const content = "Hello 世界 🌍";

    await writeFileTool.handler({ path: filePath, content }, context);

    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe(content);
  });
});
