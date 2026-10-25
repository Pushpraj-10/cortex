import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMemory } from "../src/memory.js";

describe("loadMemory", () => {
  let root: string;
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    home = path.join(root, "home");
    cwd = path.join(root, "project");
    await fs.mkdir(path.join(home, ".cortex"), { recursive: true });
    await fs.mkdir(cwd);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns an empty string when there are no memory files", async () => {
    expect(await loadMemory(cwd, home)).toBe("");
  });

  it("returns user then project instructions under headings, trimmed", async () => {
    await fs.writeFile(path.join(home, ".cortex", "CORTEX.md"), "\nbe brief\n\n");
    await fs.writeFile(path.join(cwd, "CORTEX.md"), "use tabs\n");
    expect(await loadMemory(cwd, home)).toBe("# User instructions\nbe brief\n\n# Project instructions\nuse tabs");
  });

  it("skips whichever file is missing", async () => {
    await fs.writeFile(path.join(cwd, "CORTEX.md"), "only project");
    expect(await loadMemory(cwd, home)).toBe("# Project instructions\nonly project");
  });
});
