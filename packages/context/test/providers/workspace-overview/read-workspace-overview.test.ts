import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readWorkspaceOverview } from "../../../src/providers/workspace-overview/read-workspace-overview.js";

describe("readWorkspaceOverview", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("lists top-level files and directories", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "content");
    await fs.mkdir(path.join(tempDir, "src"));

    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toContainEqual({ name: "a.txt", type: "file" });
      expect(result.value.entries).toContainEqual({ name: "src", type: "directory" });
    }
  });

  it("filters denylisted entries (node_modules, .git, dist)", async () => {
    await fs.mkdir(path.join(tempDir, "node_modules"));
    await fs.mkdir(path.join(tempDir, ".git"));
    await fs.mkdir(path.join(tempDir, "dist"));
    await fs.writeFile(path.join(tempDir, "keep.txt"), "content");

    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries.map((e) => e.name)).toEqual(["keep.txt"]);
    }
  });

  it("reads name and description from package.json when present", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "fixture-project", description: "a test fixture" }),
    );

    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageInfo).toEqual({ name: "fixture-project", description: "a test fixture" });
    }
  });

  it("omits packageInfo when package.json is absent", async () => {
    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageInfo).toBeUndefined();
    }
  });

  it("omits packageInfo when package.json is malformed, without failing the whole call", async () => {
    await fs.writeFile(path.join(tempDir, "package.json"), "{ not valid json");

    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageInfo).toBeUndefined();
    }
  });

  it("reads a README excerpt when present", async () => {
    await fs.writeFile(path.join(tempDir, "README.md"), "  This project does X.  \n\nMore text.");

    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.readmeExcerpt).toContain("This project does X.");
    }
  });

  it("omits readmeExcerpt when README.md is absent", async () => {
    const result = await readWorkspaceOverview(tempDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.readmeExcerpt).toBeUndefined();
    }
  });

  it("returns an error Result when the workspace directory itself doesn't exist", async () => {
    const result = await readWorkspaceOverview(path.join(tempDir, "nonexistent"));
    expect(result.ok).toBe(false);
  });
});
