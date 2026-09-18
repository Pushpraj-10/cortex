import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { listDirectoryTool } from "../../src/file-system/list-directory.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("listDirectoryTool", () => {
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
    expect(listDirectoryTool.name).toBe("list_directory");
    expect(listDirectoryTool.description).toContain("List");
    expect(listDirectoryTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("lists directory contents", async () => {
    await fs.writeFile(path.join(tempDir, "file1.txt"), "content");
    await fs.writeFile(path.join(tempDir, "file2.txt"), "content");
    await fs.mkdir(path.join(tempDir, "subdir"));

    const result = await listDirectoryTool.handler({ path: "." }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(3);
      expect(result.value.entries).toContainEqual({ name: "file1.txt", type: "file" });
      expect(result.value.entries).toContainEqual({ name: "file2.txt", type: "file" });
      expect(result.value.entries).toContainEqual({ name: "subdir", type: "directory" });
    }
  });

  it("returns empty list for empty directory", async () => {
    const result = await listDirectoryTool.handler({ path: "." }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(0);
    }
  });

  it("returns error when directory does not exist", async () => {
    const result = await listDirectoryTool.handler({ path: "nonexistent" }, context);

    expect(result.ok).toBe(false);
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await listDirectoryTool.handler({ path: ".." }, context);
    expect(result.ok).toBe(false);
  });
});
