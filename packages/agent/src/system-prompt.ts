import type { PermissionMode } from "@cortex/policy";
import { getAgentMode, type AgentModeId } from "./agent-modes.js";

export interface SystemPromptOptions {
  workspaceRoot: string;
  /** When "plan", the model is told it may only read. */
  mode?: PermissionMode;
  /** The active agent mode; its instructions are added after the base prompt. */
  agent?: AgentModeId;
  /** The user's CORTEX.md contents. */
  memory?: string;
  /** One line per skill; the bodies load on demand through the skill tool. */
  skillIndex?: string;
}

/**
 * The system prompt for the normal coding-agent chat loop.
 *
 * The invariants below are not generic advice — each one names a failure observed in
 * a real session against a local 8B model, which otherwise: wrote `/** *\/` comments
 * into a Python file six times without self-correcting; replaced working functions
 * with `# your code here` stubs; and, asked to comment `main.py`, wrote a brand-new
 * `main.py.comments` instead and reported success.
 *
 * The "use the tool-calling mechanism" line exists because dropping it was a real gap:
 * verified live, `llama3.1:8b` offered real tools still sometimes narrated its
 * intended calls as markdown-fenced JSON inside its own text instead of actually
 * invoking one — safe (nothing runs from narration) but useless (the task never gets
 * done).
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const sections = [
    [
      `You are Cortex, a coding agent working in the repository rooted at ${options.workspaceRoot}.`,
      "Understand the task, inspect the repository only if the task needs it, and make the",
      "minimum change that accomplishes it. A greeting, a general question, or anything you can",
      "answer without the code needs no tools — just reply. Prefer edit_file for a targeted change to an existing file over",
      "rewriting it with write_file. Use write_file only to create a new file or when the",
      "whole file's contents need to change.",
      "",
      "You have tools available. When you need to act, invoke a tool directly through the",
      "tool-calling mechanism you were given — never describe, narrate, or print what a tool",
      "call would look like as text or a code block. If you are not calling a tool, you are",
      "giving your final answer.",
      "",
      "Always:",
      "- Write comments and code in the target file's own language. A .py file uses #, a .js",
      "  or .ts file uses // — never carry one language's syntax into another's file.",
      "- Keep every existing line that the task does not require changing. Never replace real",
      "  code with a placeholder like '# your code here' or 'TODO' — if you do not know what a",
      "  line does, read the file again rather than dropping it.",
      "- Deliver the change in the file you were asked to change. Do not create a new or",
      "  companion file (like main.py.comments) to hold your work unless you were asked to.",
      "- Read a file before editing it, so your edit is based on its real contents.",
      "- If a tool call is denied or blocked, do not retry it unchanged; adapt or ask the user.",
      "",
      "Explain what you changed and why once you are done.",
    ].join("\n"),
  ];

  if (options.mode === "plan") {
    sections.push("Plan mode: you may only read. Investigate, then present a plan; do not modify anything.");
  }
  if (options.agent) sections.push(getAgentMode(options.agent).prompt);
  if (options.skillIndex) {
    sections.push(`Skills available through the skill tool (load one when it fits the task):\n${options.skillIndex}`);
  }
  if (options.memory) sections.push(options.memory);

  return sections.join("\n\n");
}
