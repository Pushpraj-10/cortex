import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createDirectoryTool } from "../../src/file-system/create-directory.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("createDirectoryTool", () => {
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
    expect(createDirectoryTool.name).toBe("create_directory");
    expect(createDirectoryTool.description).toContain("Create");
    expect(createDirectoryTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("creates a directory", async () => {
    const result = await createDirectoryTool.handler({ path: "newdir" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const stat = await fs.stat(path.join(tempDir, "newdir"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("creates nested directories", async () => {
    const result = await createDirectoryTool.handler({ path: "a/b/c" }, context);

    expect(result.ok).toBe(true);

    const stat = await fs.stat(path.join(tempDir, "a", "b", "c"));
    expect(stat.isDirectory()).toBe(true);
  });

  it("succeeds when directory already exists", async () => {
    await fs.mkdir(path.join(tempDir, "existing"));

    const result = await createDirectoryTool.handler({ path: "existing" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await createDirectoryTool.handler({ path: "../outside" }, context);
    expect(result.ok).toBe(false);
  });
});
