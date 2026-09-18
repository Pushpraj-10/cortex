import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileTool } from "../../src/file-system/read-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("readFileTool", () => {
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
    expect(readFileTool.name).toBe("read_file");
    expect(readFileTool.description).toContain("Read");
    expect(readFileTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("reads file contents successfully", async () => {
    const content = "Hello, World!";
    await fs.writeFile(path.join(tempDir, "test.txt"), content, "utf-8");

    const result = await readFileTool.handler({ path: "test.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });

  it("returns error when file does not exist", async () => {
    const result = await readFileTool.handler({ path: "nonexistent.txt" }, context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TOOL_FILE_SYSTEM_ERROR");
    }
  });

  it("reads UTF-8 encoded files", async () => {
    const content = "Hello 世界 🌍";
    await fs.writeFile(path.join(tempDir, "unicode.txt"), content, "utf-8");

    const result = await readFileTool.handler({ path: "unicode.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe(content);
    }
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await readFileTool.handler({ path: "../outside.txt" }, context);
    expect(result.ok).toBe(false);
  });
});
