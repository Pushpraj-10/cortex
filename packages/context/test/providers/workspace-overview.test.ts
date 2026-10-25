import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { formatOverview, readWorkspaceOverview, workspaceOverviewProvider } from "../../src/providers/workspace-overview.js";

describe("formatOverview", () => {
  it("renders package name and description when present", () => {
    const result = formatOverview({ entries: [], packageInfo: { name: "my-project", description: "does things" } });
    expect(result).toContain("Project: my-project — does things");
  });

  it("renders package name without a trailing dash when there is no description", () => {
    const result = formatOverview({ entries: [], packageInfo: { name: "my-project" } });
    expect(result).toContain("Project: my-project");
    expect(result).not.toContain("—");
  });

  it("omits the project line entirely when there is no packageInfo", () => {
    const result = formatOverview({ entries: [] });
    expect(result).not.toContain("Project:");
  });

  it("renders a bulleted directory listing, marking directories with a trailing slash", () => {
    const result = formatOverview({
      entries: [
        { name: "src", type: "directory" },
        { name: "package.json", type: "file" },
      ],
    });
    expect(result).toContain("- src/");
    expect(result).toContain("- package.json");
  });

  it("omits the directory listing section when there are no entries", () => {
    const result = formatOverview({ entries: [] });
    expect(result).not.toContain("Top-level contents:");
  });

  it("renders a README excerpt when present", () => {
    const result = formatOverview({ entries: [], readmeExcerpt: "This project does X." });
    expect(result).toContain("README excerpt:\nThis project does X.");
  });

  it("omits the README section when absent", () => {
    const result = formatOverview({ entries: [] });
    expect(result).not.toContain("README excerpt:");
  });

  it("returns an empty string when there is nothing to report", () => {
    expect(formatOverview({ entries: [] })).toBe("");
  });
});

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

describe("workspaceOverviewProvider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("always applies (declares no applies() predicate)", () => {
    expect(workspaceOverviewProvider.applies).toBeUndefined();
  });

  it("contributes one low-relevance fragment so request-specific context outranks it", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "x");

    const result = await workspaceOverviewProvider.gather({ workspaceRoot: tempDir, userMessage: "hi" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({ providerId: "workspace-overview", title: "Workspace Overview", relevance: 0.1 });
      expect(result.value[0]?.content).toContain("a.txt");
    }
  });

  it("returns an error Result when the workspace cannot be read", async () => {
    const result = await workspaceOverviewProvider.gather({ workspaceRoot: path.join(tempDir, "missing"), userMessage: "hi" });
    expect(result.ok).toBe(false);
  });
});
