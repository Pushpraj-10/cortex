import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { writeFileTool } from "../../src/file-system/write-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("writeFileTool", () => {
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
    expect(writeFileTool.name).toBe("write_file");
    expect(writeFileTool.description).toContain("Create");
    expect(writeFileTool.parametersSchema).toHaveProperty("properties.path");
    expect(writeFileTool.parametersSchema).toHaveProperty("properties.content");
  });

  it("writes file contents successfully", async () => {
    const content = "Hello, World!";

    const result = await writeFileTool.handler({ path: "test.txt", content }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const written = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(written).toBe(content);
  });

  it("overwrites existing files", async () => {
    await fs.writeFile(path.join(tempDir, "test.txt"), "old content", "utf-8");

    const newContent = "new content";
    const result = await writeFileTool.handler({ path: "test.txt", content: newContent }, context);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(written).toBe(newContent);
  });

  it("creates parent directories if needed", async () => {
    const content = "nested file";

    const result = await writeFileTool.handler({ path: "subdir/nested/file.txt", content }, context);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(path.join(tempDir, "subdir", "nested", "file.txt"), "utf-8");
    expect(written).toBe(content);
  });

  it("handles UTF-8 content", async () => {
    const content = "Hello 世界 🌍";

    await writeFileTool.handler({ path: "unicode.txt", content }, context);

    const written = await fs.readFile(path.join(tempDir, "unicode.txt"), "utf-8");
    expect(written).toBe(content);
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await writeFileTool.handler({ path: "../outside.txt", content: "x" }, context);
    expect(result.ok).toBe(false);
  });
});
