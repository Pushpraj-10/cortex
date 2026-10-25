import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSkillTool, loadSkills, parseSkill, renderSkillIndex } from "../src/skills.js";

describe("parseSkill", () => {
  it("reads frontmatter and body", () => {
    const skill = parseSkill('---\nname: review\ndescription: "Reviews diffs"\n---\n\nDo the review.\n', "fallback");
    expect(skill).toEqual({ name: "review", description: "Reviews diffs", body: "Do the review." });
  });

  it("falls back to the directory name without frontmatter", () => {
    expect(parseSkill("just text", "dir")).toEqual({ name: "dir", description: "", body: "just text" });
  });
});

describe("loadSkills", () => {
  let root: string;
  let home: string;
  let cwd: string;

  const writeSkill = async (base: string, dir: string, content: string) => {
    await fs.mkdir(path.join(base, ".cortex", "skills", dir), { recursive: true });
    await fs.writeFile(path.join(base, ".cortex", "skills", dir, "SKILL.md"), content);
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    home = path.join(root, "home");
    cwd = path.join(root, "project");
    await fs.mkdir(home);
    await fs.mkdir(cwd);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns nothing when no skills directory exists", async () => {
    expect(await loadSkills(cwd, home)).toEqual([]);
  });

  it("loads user and project skills, and the project one wins a name clash", async () => {
    await writeSkill(home, "shared", "---\nname: shared\ndescription: user\n---\nuser body");
    await writeSkill(home, "only-user", "---\nname: only-user\ndescription: u\n---\nu");
    await writeSkill(cwd, "shared", "---\nname: shared\ndescription: project\n---\nproject body");

    const skills = await loadSkills(cwd, home);
    expect(skills.map((s) => s.name).sort()).toEqual(["only-user", "shared"]);
    expect(skills.find((s) => s.name === "shared")?.body).toBe("project body");
  });

  it("skips folders without a SKILL.md", async () => {
    await fs.mkdir(path.join(cwd, ".cortex", "skills", "empty"), { recursive: true });
    expect(await loadSkills(cwd, home)).toEqual([]);
  });
});

describe("renderSkillIndex", () => {
  it("lists one line per skill", () => {
    const skills = [
      { name: "a", description: "does a", body: "A" },
      { name: "b", description: "does b", body: "B" },
    ];
    expect(renderSkillIndex(skills)).toBe("- a: does a\n- b: does b");
  });
});

describe("createSkillTool", () => {
  const skills = [{ name: "review", description: "Reviews diffs", body: "Do the review." }];
  const tool = createSkillTool(skills);

  it("is a read-only tool", () => {
    expect(tool.name).toBe("skill");
    expect(tool.kind).toBe("read");
  });

  it("returns a skill's body", async () => {
    expect(await tool.handler({ name: "review" }, { cwd: "." })).toEqual({ ok: true, value: { instructions: "Do the review." } });
  });

  it("fails for an unknown skill and lists the available ones", async () => {
    const result = await tool.handler({ name: "nope" }, { cwd: "." });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("Available: review");
  });
});
