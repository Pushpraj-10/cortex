/**
 * Skills: reusable instruction packs the model loads on demand. Only a skill's name and description
 * live in the system prompt; its body is returned by the `skill` tool when the model asks for it, so
 * unused skills cost almost nothing. A skill is a folder `<name>/SKILL.md` with `name` and
 * `description` frontmatter.
 */
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { defineTool, type ToolDefinition } from "@cortex/tools";

export interface Skill {
  name: string;
  description: string;
  body: string;
}

// ---- Parsing and loading ---------------------------------------------------------

/** Minimal `---` frontmatter parser: flat `key: value` lines only. Falls back to the folder name. */
export function parseSkill(source: string, fallbackName: string): Skill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  const meta: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (pair) meta[pair[1]!] = pair[2]!.replace(/^["']|["']$/g, "");
  }
  return { name: meta.name ?? fallbackName, description: meta.description ?? "", body: (match ? match[2]! : source).trim() };
}

/** Reads `<dir>/<name>/SKILL.md` for every subdirectory. A missing dir or a non-skill entry is skipped. */
async function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    try {
      skills.push(parseSkill(await fs.readFile(path.join(dir, entry, "SKILL.md"), "utf-8"), entry));
    } catch {
      /* not a skill directory */
    }
  }
  return skills;
}

/** `<cwd>/.cortex/skills/*` overrides `~/.cortex/skills/*` when names clash. */
export async function loadSkills(cwd: string, home = homedir()): Promise<Skill[]> {
  const byName = new Map<string, Skill>();
  const user = await loadSkillsFromDir(path.join(home, ".cortex", "skills"));
  const project = await loadSkillsFromDir(path.join(cwd, ".cortex", "skills"));
  for (const skill of [...user, ...project]) byName.set(skill.name, skill);
  return [...byName.values()];
}

// ---- Exposing skills to the model ------------------------------------------------

/** One line per skill for the system prompt; bodies stay out until the skill tool loads them. */
export function renderSkillIndex(skills: Skill[]): string {
  return skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
}

/** The tool the model calls to load a skill's full instructions. */
export function createSkillTool(skills: Skill[]): ToolDefinition<{ name: string }, { instructions: string }> {
  return defineTool({
    name: "skill",
    description: "Load the full instructions of a named skill, then follow them.",
    kind: "read",
    parametersSchema: {
      type: "object",
      properties: { name: { type: "string", description: "The skill's name, from the skill list" } },
      required: ["name"],
    },
    summarize: (args) => `Load skill ${typeof args?.name === "string" ? args.name : "?"}`,
    failure: (args) => `Failed to load skill ${args.name}`,
    async run(args) {
      const skill = skills.find((candidate) => candidate.name === args.name);
      if (!skill) throw new Error(`Unknown skill "${args.name}". Available: ${skills.map((s) => s.name).join(", ")}`);
      return { instructions: skill.body };
    },
  });
}
