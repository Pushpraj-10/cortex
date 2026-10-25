import type { PermissionMode } from "../permissions/types";

export interface SystemPromptInput {
  cwd: string;
  mode: PermissionMode;
  memory: string;
  /** Pre-rendered skill index lines, e.g. `- review: Reviews diffs`. */
  skillIndex: string;
}

const BASE = `You are a coding agent running in a terminal. Use the available tools to inspect and change the user's project.
- Read files before editing them. Prefer Edit over Write for existing files.
- Keep working until the task is done, then reply with a short summary.
- If a tool call is denied or blocked, do not retry it unchanged; adapt or ask the user.`;

export function buildSystemPrompt(i: SystemPromptInput): string {
  const sections = [BASE, `Working directory: ${i.cwd}\nPermission mode: ${i.mode}`];
  if (i.mode === "plan") sections.push("Plan mode: you may only read. Produce a plan; do not modify anything.");
  if (i.skillIndex) sections.push(`Skills available via the Skill tool:\n${i.skillIndex}`);
  if (i.memory) sections.push(i.memory);
  return sections.join("\n\n");
}
