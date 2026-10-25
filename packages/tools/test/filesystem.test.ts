import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { copyFileTool, createDirectoryTool, deleteFileTool, editFileTool, fileExistsTool, getFileInfoTool, listDirectoryTool, moveFileTool, readFileTool, writeFileTool } from "../src/filesystem.js";
import type { ToolExecutionContext } from "../src/types.js";

describe("copyFileTool", () => {
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
    expect(copyFileTool.name).toBe("copy_file");
    expect(copyFileTool.description).toContain("Copy");
    expect(copyFileTool.parametersSchema).toHaveProperty("properties.from");
    expect(copyFileTool.parametersSchema).toHaveProperty("properties.to");
  });

  it("copies file to new location", async () => {
    const content = "file content";
    await fs.writeFile(path.join(tempDir, "original.txt"), content, "utf-8");

    const result = await copyFileTool.handler({ from: "original.txt", to: "copy.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const fromContent = await fs.readFile(path.join(tempDir, "original.txt"), "utf-8");
    expect(fromContent).toBe(content);

    const toContent = await fs.readFile(path.join(tempDir, "copy.txt"), "utf-8");
    expect(toContent).toBe(content);
  });

  it("creates destination directory if needed", async () => {
    const content = "content";
    await fs.writeFile(path.join(tempDir, "file.txt"), content, "utf-8");

    const result = await copyFileTool.handler({ from: "file.txt", to: "newdir/subdir/file.txt" }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(path.join(tempDir, "newdir", "subdir", "file.txt"), "utf-8");
    expect(toContent).toBe(content);
  });

  it("overwrites destination file if it exists", async () => {
    await fs.writeFile(path.join(tempDir, "source.txt"), "new content", "utf-8");
    await fs.writeFile(path.join(tempDir, "target.txt"), "old content", "utf-8");

    const result = await copyFileTool.handler({ from: "source.txt", to: "target.txt" }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(path.join(tempDir, "target.txt"), "utf-8");
    expect(toContent).toBe("new content");
  });

  it("returns error when source file does not exist", async () => {
    const result = await copyFileTool.handler({ from: "nonexistent.txt", to: "target.txt" }, context);

    expect(result.ok).toBe(false);
  });

  it("rejects a from/to path that escapes the workspace root", async () => {
    const result = await copyFileTool.handler({ from: "../outside.txt", to: "target.txt" }, context);
    expect(result.ok).toBe(false);
  });
});

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
      expect(result.error.code).toBe("TOOL_FAILED");
    }
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await deleteFileTool.handler({ path: "../outside.txt" }, context);
    expect(result.ok).toBe(false);
  });
});

describe("editFileTool", () => {
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
    expect(editFileTool.name).toBe("edit_file");
    expect(editFileTool.description).toContain("modification");
    expect(editFileTool.parametersSchema).toHaveProperty("properties.path");
    expect(editFileTool.parametersSchema).toHaveProperty("properties.oldString");
    expect(editFileTool.parametersSchema).toHaveProperty("properties.newString");
  });

  it("replaces text successfully", async () => {
    const original = "Hello, World! Hello!";
    await fs.writeFile(path.join(tempDir, "test.txt"), original, "utf-8");

    const result = await editFileTool.handler(
      { path: "test.txt", oldString: "World", newString: "Universe" },
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
      expect(result.value.applied).toBe(true);
    }

    const edited = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(edited).toBe("Hello, Universe! Hello!");
  });

  it("returns an error (not a silent applied:false) when oldString is not found", async () => {
    await fs.writeFile(path.join(tempDir, "test.txt"), "Hello, World!", "utf-8");

    const result = await editFileTool.handler(
      { path: "test.txt", oldString: "notfound", newString: "replacement" },
      context,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("oldString was not found");

    const unchanged = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(unchanged).toBe("Hello, World!");
  });

  it("returns error when file does not exist", async () => {
    const result = await editFileTool.handler(
      { path: "nonexistent.txt", oldString: "old", newString: "new" },
      context,
    );

    expect(result.ok).toBe(false);
  });

  it("replaces first occurrence only (default replace behavior)", async () => {
    const original = "foo bar foo baz foo";
    await fs.writeFile(path.join(tempDir, "test.txt"), original, "utf-8");

    await editFileTool.handler({ path: "test.txt", oldString: "foo", newString: "FOO" }, context);

    const edited = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(edited).toBe("FOO bar foo baz foo");
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await editFileTool.handler(
      { path: "../outside.txt", oldString: "a", newString: "b" },
      context,
    );
    expect(result.ok).toBe(false);
  });
});

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
      expect(result.error.code).toBe("TOOL_FAILED");
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

describe("moveFileTool", () => {
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
    expect(moveFileTool.name).toBe("move_file");
    expect(moveFileTool.description).toContain("Move");
    expect(moveFileTool.parametersSchema).toHaveProperty("properties.from");
    expect(moveFileTool.parametersSchema).toHaveProperty("properties.to");
  });

  it("moves file to new location", async () => {
    const content = "file content";
    await fs.writeFile(path.join(tempDir, "original.txt"), content, "utf-8");

    const result = await moveFileTool.handler({ from: "original.txt", to: "moved.txt" }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const fromExists = await fs
      .access(path.join(tempDir, "original.txt"))
      .then(() => true)
      .catch(() => false);
    expect(fromExists).toBe(false);

    const toContent = await fs.readFile(path.join(tempDir, "moved.txt"), "utf-8");
    expect(toContent).toBe(content);
  });

  it("renames file", async () => {
    await fs.writeFile(path.join(tempDir, "old.txt"), "content", "utf-8");

    const result = await moveFileTool.handler({ from: "old.txt", to: "new.txt" }, context);

    expect(result.ok).toBe(true);

    const newExists = await fs
      .access(path.join(tempDir, "new.txt"))
      .then(() => true)
      .catch(() => false);
    expect(newExists).toBe(true);
  });

  it("creates destination directory if needed", async () => {
    await fs.writeFile(path.join(tempDir, "file.txt"), "content", "utf-8");

    const result = await moveFileTool.handler({ from: "file.txt", to: "newdir/subdir/file.txt" }, context);

    expect(result.ok).toBe(true);

    const toContent = await fs.readFile(path.join(tempDir, "newdir", "subdir", "file.txt"), "utf-8");
    expect(toContent).toBe("content");
  });

  it("returns error when source file does not exist", async () => {
    const result = await moveFileTool.handler({ from: "nonexistent.txt", to: "target.txt" }, context);

    expect(result.ok).toBe(false);
  });

  it("rejects a from/to path that escapes the workspace root", async () => {
    const result = await moveFileTool.handler({ from: "../outside.txt", to: "target.txt" }, context);
    expect(result.ok).toBe(false);
  });
});

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
      expect(result.error.code).toBe("TOOL_FAILED");
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

describe("writeFileTool", () => {
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
    expect(writeFileTool.name).toBe("write_file");
    expect(writeFileTool.description).toContain("Create");
    expect(writeFileTool.parametersSchema).toHaveProperty("properties.path");
    expect(writeFileTool.parametersSchema).toHaveProperty("properties.content");
  });

  it("writes file contents successfully", async () => {
    const content = "Hello, World!";

    const result = await writeFileTool.handler({ path: "test.txt", content }, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.success).toBe(true);
    }

    const written = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(written).toBe(content);
  });

  it("overwrites existing files", async () => {
    await fs.writeFile(path.join(tempDir, "test.txt"), "old content", "utf-8");

    const newContent = "new content";
    const result = await writeFileTool.handler({ path: "test.txt", content: newContent }, context);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(path.join(tempDir, "test.txt"), "utf-8");
    expect(written).toBe(newContent);
  });

  it("creates parent directories if needed", async () => {
    const content = "nested file";

    const result = await writeFileTool.handler({ path: "subdir/nested/file.txt", content }, context);

    expect(result.ok).toBe(true);

    const written = await fs.readFile(path.join(tempDir, "subdir", "nested", "file.txt"), "utf-8");
    expect(written).toBe(content);
  });

  it("handles UTF-8 content", async () => {
    const content = "Hello 世界 🌍";

    await writeFileTool.handler({ path: "unicode.txt", content }, context);

    const written = await fs.readFile(path.join(tempDir, "unicode.txt"), "utf-8");
    expect(written).toBe(content);
  });

  it("rejects a path that escapes the workspace root", async () => {
    const result = await writeFileTool.handler({ path: "../outside.txt", content: "x" }, context);
    expect(result.ok).toBe(false);
  });
});
