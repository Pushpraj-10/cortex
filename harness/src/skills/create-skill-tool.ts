import type { ToolDef } from "../tools/types";
import type { Skill } from "./types";

/** Progressive disclosure: only name+description sit in the system prompt; the body loads on demand. */
export function createSkillTool(skills: Skill[]): ToolDef {
  return {
    name: "Skill",
    description: "Load the full instructions of a named skill, then follow them.",
    readOnly: true,
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    async run(input) {
      const skill = skills.find((s) => s.name === input.name);
      if (!skill) throw new Error(`Unknown skill "${String(input.name)}". Available: ${skills.map((s) => s.name).join(", ")}`);
      return skill.body;
    },
  };
}
