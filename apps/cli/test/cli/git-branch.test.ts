import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readGitBranch } from "../../src/cli/git-branch.js";

describe("readGitBranch", () => {
  let root: string;

  /** A made-up repository under the temp folder, so a real repository above the project cannot leak in. */
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-git-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function repository(head: string, folder = root) {
    await fs.mkdir(path.join(folder, ".git"), { recursive: true });
    await fs.writeFile(path.join(folder, ".git", "HEAD"), head, "utf-8");
  }

  it("reads the branch from HEAD", async () => {
    await repository("ref: refs/heads/main\n");
    expect(readGitBranch(root)).toBe("main");
  });

  it("keeps slashes in a branch name", async () => {
    await repository("ref: refs/heads/feature/streaming-ui\n");
    expect(readGitBranch(root)).toBe("feature/streaming-ui");
  });

  it("finds the repository from a folder inside it", async () => {
    await repository("ref: refs/heads/dev\n");
    const deep = path.join(root, "packages", "app", "src");
    await fs.mkdir(deep, { recursive: true });
    expect(readGitBranch(deep)).toBe("dev");
  });

  it("shows a short hash when HEAD is detached", async () => {
    await repository("4c5907f1d2e3a4b5c6d7e8f90123456789abcdef\n");
    expect(readGitBranch(root)).toBe("4c5907f");
  });

  it("follows a .git file that points at the real git directory, as a worktree or submodule has", async () => {
    const real = path.join(root, "elsewhere", "worktrees", "feature");
    await fs.mkdir(real, { recursive: true });
    await fs.writeFile(path.join(real, "HEAD"), "ref: refs/heads/feature\n", "utf-8");
    const work = path.join(root, "work");
    await fs.mkdir(work);
    await fs.writeFile(path.join(work, ".git"), `gitdir: ${path.join("..", "elsewhere", "worktrees", "feature")}\n`, "utf-8");
    expect(readGitBranch(work)).toBe("feature");
  });

  it("is undefined outside a repository", () => {
    expect(readGitBranch(root)).toBeUndefined();
  });

  it("is undefined, not an error, for a HEAD it does not understand or cannot read", async () => {
    await repository("something unexpected\n");
    expect(readGitBranch(root)).toBeUndefined();

    await fs.rm(path.join(root, ".git", "HEAD"));
    expect(readGitBranch(root)).toBeUndefined();
  });

  it("is undefined for a .git file with no gitdir line, and for a folder that does not exist", async () => {
    await fs.writeFile(path.join(root, ".git"), "not a pointer", "utf-8");
    expect(readGitBranch(root)).toBeUndefined();
    expect(readGitBranch(path.join(root, "no", "such", "folder"))).toBeUndefined();
  });
});
