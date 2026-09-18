import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { editFileTool } from "../../src/file-system/edit-file.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("editFileTool", () => {
  let tempDir: string;
  const context: ToolExecutionContext = { cwd: process.cwd() };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(editFileTool.name).toBe("edit_file");
    expect(editFileTool.description).toContain("modification");
    expect(editFileTool.parametersSchema).toHaveProperty("properties.path");
    expect(editFileTool.parametersSchema).toHaveProperty("properties.oldString");
    expect(editFileTool.parametersSchema).toHaveProperty("properties.newString");
  });

  it("replaces text successfully", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const original = "Hello, World! Hello!";
    await fs.writeFile(filePath, original, "utf-8");

    const result = await editFileTool.handler(
      { path: filePath, oldString: "World", newString: "Universe" },
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.applied).toBe(true);
    }

    const edited = await fs.readFile(filePath, "utf-8");
    expect(edited).toBe("Hello, Universe! Hello!");
  });

  it("returns applied:false when oldString not found", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "Hello, World!", "utf-8");

    const result = await editFileTool.handler(
      { path: filePath, oldString: "notfound", newString: "replacement" },
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(false);
      expect(result.value.applied).toBe(false);
    }

    const unchanged = await fs.readFile(filePath, "utf-8");
    expect(unchanged).toBe("Hello, World!");
  });

  it("returns error when file does not exist", async () => {
    const filePath = path.join(tempDir, "nonexistent.txt");

    const result = await editFileTool.handler(
      { path: filePath, oldString: "old", newString: "new" },
      context,
    );

    expect(result.ok).toBe(false);
  });

  it("replaces first occurrence only (default replace behavior)", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const original = "foo bar foo baz foo";
    await fs.writeFile(filePath, original, "utf-8");

    const result = await editFileTool.handler(
      { path: filePath, oldString: "foo", newString: "FOO" },
      context,
    );

    const edited = await fs.readFile(filePath, "utf-8");
    expect(edited).toBe("FOO bar foo baz foo");
  });
});
