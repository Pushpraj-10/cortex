import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { deleteFileTool } from "../../src/file-system/delete-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("deleteFileTool", () => {
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
    expect(deleteFileTool.name).toBe("delete_file");
    expect(deleteFileTool.description).toContain("Delete");
    expect(deleteFileTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("deletes file successfully", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "content", "utf-8");

    const result = await deleteFileTool.handler({ path: "test.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  it("returns error when file does not exist", async () => {
    const result = await deleteFileTool.handler({ path: "nonexistent.txt" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_FILE_SYSTEM_ERROR");
    }
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await deleteFileTool.handler({ path: "../outside.txt" }, context);
    expect(result.ok).toBe(false);
  });
});
