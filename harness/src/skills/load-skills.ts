import { homedir } from "node:os";
import { join } from "node:path";
import { loadSkillsFromDir } from "./load-skills-from-dir";
import type { Skill } from "./types";

/** `<cwd>/.cortex/skills/*` overrides `~/.cortex/skills/*` on name clashes. */
export async function loadSkills(cwd: string, home = homedir()): Promise<Skill[]> {
  const byName = new Map<string, Skill>();
  const user = await loadSkillsFromDir(join(home, ".cortex", "skills"));
  const project = await loadSkillsFromDir(join(cwd, ".cortex", "skills"));
  for (const s of [...user, ...project]) byName.set(s.name, s);
  return [...byName.values()];
}
