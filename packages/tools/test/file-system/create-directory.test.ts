import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDirectoryTool } from "../../src/file-system/create-directory.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("createDirectoryTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(createDirectoryTool.name).toBe("create_directory");
    expect(createDirectoryTool.description).toContain("Create");
    expect(createDirectoryTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("creates a directory", async () => {
    const dirPath = path.join(tempDir, "newdir");

    const result = await createDirectoryTool.handler({ path: dirPath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const stat = await fs.stat(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates nested directories", async () => {
    const dirPath = path.join(tempDir, "a", "b", "c");

    const result = await createDirectoryTool.handler({ path: dirPath }, context);

    expect(result.ok).toBe(true);

    const stat = await fs.stat(dirPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("succeeds when directory already exists", async () => {
    const dirPath = path.join(tempDir, "existing");
    await fs.mkdir(dirPath);

    const result = await createDirectoryTool.handler({ path: dirPath }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }
  });
});
