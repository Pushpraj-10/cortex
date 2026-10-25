import type { Skill } from "./types";

/** One line per skill for the system prompt; bodies stay out until the Skill tool loads them. */
export function renderSkillIndex(skills: Skill[]): string {
  return skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
}
