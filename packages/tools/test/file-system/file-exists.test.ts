import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileExistsTool } from "../../src/file-system/file-exists.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("fileExistsTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(fileExistsTool.name).toBe("file_exists");
    expect(fileExistsTool.description).toContain("Check");
    expect(fileExistsTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("returns true for existing file", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "content", "utf-8");

    const result = await fileExistsTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(true);
    }
  });

  it("returns true for existing directory", async () => {
    const dirPath = path.join(tempDir, "subdir");
    await fs.mkdir(dirPath);

    const result = await fileExistsTool.handler({ path: dirPath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(true);
    }
  });

  it("returns false for nonexistent path", async () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    const result = await fileExistsTool.handler({ path: filePath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(false);
    }
  });
});
