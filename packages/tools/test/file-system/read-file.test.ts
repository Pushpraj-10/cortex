import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileTool } from "../../src/file-system/read-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("readFileTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(readFileTool.name).toBe("read_file");
    expect(readFileTool.description).toContain("Read");
    expect(readFileTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("reads file contents successfully", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const content = "Hello, World!";
    await fs.writeFile(filePath, content, "utf-8");

    const result = await readFileTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });

  it("returns error when file does not exist", async () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    const result = await readFileTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_FILE_SYSTEM_ERROR");
    }
  });

  it("reads UTF-8 encoded files", async () => {
    const filePath = path.join(tempDir, "unicode.txt");
    const content = "Hello 世界 🌍";
    await fs.writeFile(filePath, content, "utf-8");

    const result = await readFileTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });
});
