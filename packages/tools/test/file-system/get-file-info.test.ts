import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getFileInfoTool } from "../../src/file-system/get-file-info.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("getFileInfoTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(getFileInfoTool.name).toBe("get_file_info");
    expect(getFileInfoTool.description).toContain("metadata");
    expect(getFileInfoTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("returns file info for a file", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const content = "Hello, World!";
    await fs.writeFile(filePath, content, "utf-8");

    const result = await getFileInfoTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isFile).toBe(true);
      expect(result.value.isDirectory).toBe(false);
      expect(result.value.size).toBe(content.length);
      expect(result.value.modified).toBeDefined();
      expect(result.value.created).toBeDefined();
    }
  });

  it("returns directory info for a directory", async () => {
    const dirPath = path.join(tempDir, "subdir");
    await fs.mkdir(dirPath);

    const result = await getFileInfoTool.handler({ path: dirPath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isFile).toBe(false);
      expect(result.value.isDirectory).toBe(true);
      expect(result.value.modified).toBeDefined();
      expect(result.value.created).toBeDefined();
    }
  });

  it("returns error for nonexistent path", async () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    const result = await getFileInfoTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_FILE_SYSTEM_ERROR");
    }
  });

  it("returns timestamps in ISO format", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "content", "utf-8");

    const result = await getFileInfoTool.handler({ path: filePath }, context);

    if (result.ok) {
      expect(result.value.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.value.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
