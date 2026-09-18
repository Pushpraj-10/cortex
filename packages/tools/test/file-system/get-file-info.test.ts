import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getFileInfoTool } from "../../src/file-system/get-file-info.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("getFileInfoTool", () => {
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
    expect(getFileInfoTool.name).toBe("get_file_info");
    expect(getFileInfoTool.description).toContain("metadata");
    expect(getFileInfoTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("returns file info for a file", async () => {
    const content = "Hello, World!";
    await fs.writeFile(path.join(tempDir, "test.txt"), content, "utf-8");

    const result = await getFileInfoTool.handler({ path: "test.txt" }, context);

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
    await fs.mkdir(path.join(tempDir, "subdir"));

    const result = await getFileInfoTool.handler({ path: "subdir" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isFile).toBe(false);
      expect(result.value.isDirectory).toBe(true);
      expect(result.value.modified).toBeDefined();
      expect(result.value.created).toBeDefined();
    }
  });

  it("returns error for nonexistent path", async () => {
    const result = await getFileInfoTool.handler({ path: "nonexistent.txt" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_FILE_SYSTEM_ERROR");
    }
  });

  it("returns timestamps in ISO format", async () => {
    await fs.writeFile(path.join(tempDir, "test.txt"), "content", "utf-8");

    const result = await getFileInfoTool.handler({ path: "test.txt" }, context);

    if (result.ok) {
      expect(result.value.modified).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.value.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await getFileInfoTool.handler({ path: "../outside.txt" }, context);
    expect(result.ok).toBe(false);
  });
});
