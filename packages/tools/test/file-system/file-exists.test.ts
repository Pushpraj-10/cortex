import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileExistsTool } from "../../src/file-system/file-exists.js";
import type { ToolExecutionContext } from "../../src/types.js";

describe("fileExistsTool", () => {
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
    expect(fileExistsTool.name).toBe("file_exists");
    expect(fileExistsTool.description).toContain("Check");
    expect(fileExistsTool.parametersSchema).toHaveProperty("properties.path");
  });

  it("returns true for existing file", async () => {
    await fs.writeFile(path.join(tempDir, "test.txt"), "content", "utf-8");

    const result = await fileExistsTool.handler({ path: "test.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(true);
    }
  });

  it("returns true for existing directory", async () => {
    await fs.mkdir(path.join(tempDir, "subdir"));

    const result = await fileExistsTool.handler({ path: "subdir" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(true);
    }
  });

  it("returns false for nonexistent path", async () => {
    const result = await fileExistsTool.handler({ path: "nonexistent.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(false);
    }
  });

  it("returns false (not an error) for a path that escapes the workspace root", async () => {
    const result = await fileExistsTool.handler({ path: "../outside.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exists).toBe(false);
    }
  });
});
