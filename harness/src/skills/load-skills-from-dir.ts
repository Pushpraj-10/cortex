import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseSkill } from "./parse-skill";
import type { Skill } from "./types";

/** Reads `<dir>/<name>/SKILL.md` for every subdirectory. A missing dir or non-skill entry is skipped. */
export async function loadSkillsFromDir(dir: string): Promise<Skill[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const skills: Skill[] = [];
  for (const entry of entries) {
    try {
      skills.push(parseSkill(await readFile(join(dir, entry, "SKILL.md"), "utf8"), entry));
    } catch {
      /* not a skill dir */
    }
  }
  return skills;
}
