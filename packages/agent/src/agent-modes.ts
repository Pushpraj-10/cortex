/**
 * Agent modes: named roles the agent can take on. A mode brings its own instructions and a limit
 * on which tools it may use, and the limit is enforced (the session hides the tools; the executor
 * refuses them), not just asked for in the prompt. It is separate from the permission mode, which
 * still applies on top: `fix` in plan mode cannot edit.
 *
 * The three built-in modes are a security pipeline. Each hands its findings to the next through a
 * report file (see @cortex/tools' save_security_report):
 *   scan -> .cortex/security/scan.md -> suggest -> suggestions.md -> fix -> fixes.md
 */
import { saveSecurityReportTool, securityReportPath, type ToolKind } from "@cortex/tools";

// ---- Definitions -----------------------------------------------------------------

export const AGENT_MODE_IDS = ["scan", "suggest", "fix"] as const;
export type AgentModeId = (typeof AGENT_MODE_IDS)[number];

export const isAgentModeId = (value: unknown): value is AgentModeId => AGENT_MODE_IDS.includes(value as AgentModeId);

export interface AgentMode {
  id: AgentModeId;
  /** One line for menus and /help. */
  description: string;
  /** Appended to the system prompt after the base block. */
  prompt: string;
  /** Tool kinds this mode may use. */
  allowedKinds: ToolKind[];
  /** Tools allowed even though their kind is not, by name. */
  extraTools: string[];
  /** What the model is told when it tries a tool outside the limit. */
  deniedHint: string;
}

const REPORT_TOOL = saveSecurityReportTool.name;

const READ_ONLY_HINT =
  "Do not retry. Describe the change in your report instead, and tell the user to run /agent fix to apply it.";

const SCAN_PROMPT = [
  "Agent mode: SCAN. Find security vulnerabilities in this repository. You are read-only: never modify code.",
  "",
  "Work through the code systematically, looking at least for: injection (SQL, command, template, NoSQL), missing or",
  "broken authentication and authorization, hard-coded secrets and keys, unsafe deserialization, path traversal,",
  "SSRF, weak or misused cryptography, unsafe eval/exec, XSS, insecure defaults and CORS, vulnerable dependencies",
  "(check manifests and lockfiles), and sensitive data in logs or error messages. Follow user input from where it",
  "enters to where it is used before calling something a vulnerability; do not report what you did not verify.",
  "",
  "Record every finding with: an id (S1, S2, ...), severity (critical/high/medium/low), file and line, the evidence",
  "(the code in question), and the impact. Order them by severity.",
  "",
  `When done, call ${REPORT_TOOL} with stage "scan" and the full list, then give the user a short summary and tell`,
  "them to run /agent suggest next.",
].join("\n");

const SUGGEST_PROMPT = [
  "Agent mode: SUGGEST. Propose fixes for the vulnerabilities a scan found. You are read-only: never modify code.",
  "",
  `Start by reading ${securityReportPath("scan")} with read_file. If it does not exist, stop and tell the user to run`,
  "/agent scan first. Re-read each affected file before proposing a change, so it is based on the real code.",
  "",
  "For every finding (keep its id), give: the root cause, a concrete fix as a before/after code snippet, any",
  "trade-offs or things the fix could break, and how to verify it. Then give a priority order: critical issues",
  "and cheap fixes first. Say so when a finding is a false positive or not worth fixing.",
  "",
  `When done, call ${REPORT_TOOL} with stage "suggestions", then give the user a short summary and tell them to run`,
  "/agent fix to apply the fixes.",
].join("\n");

const FIX_PROMPT = [
  "Agent mode: FIX. Apply fixes for the vulnerabilities found by earlier scans.",
  "",
  `Start by reading ${securityReportPath("suggestions")} with read_file; if it does not exist, read`,
  `${securityReportPath("scan")} and work out the fixes yourself. If neither exists, stop and tell the user to run`,
  "/agent scan first.",
  "",
  "Fix findings in priority order, one at a time. Make the smallest change that closes the hole, read the file",
  "before editing it and again afterwards, and do not refactor or change anything the findings do not require.",
  "After the fixes, run the project's tests and typecheck if it has them, and fix anything you broke. If a fix is",
  "risky, ambiguous or needs a decision from the user, skip it and say why instead of guessing.",
  "",
  `When done, call ${REPORT_TOOL} with stage "fixes", listing each finding id as fixed, skipped (with the reason) or`,
  "failed, and the test results. Then summarize for the user.",
].join("\n");

const MODES: Record<AgentModeId, AgentMode> = {
  scan: {
    id: "scan",
    description: "find security vulnerabilities (read-only)",
    prompt: SCAN_PROMPT,
    allowedKinds: ["read"],
    extraTools: [REPORT_TOOL],
    deniedHint: READ_ONLY_HINT,
  },
  suggest: {
    id: "suggest",
    description: "propose fixes for the scan's findings (read-only)",
    prompt: SUGGEST_PROMPT,
    allowedKinds: ["read"],
    extraTools: [REPORT_TOOL],
    deniedHint: READ_ONLY_HINT,
  },
  fix: {
    id: "fix",
    description: "apply the fixes (can edit files and run commands)",
    prompt: FIX_PROMPT,
    allowedKinds: ["read", "edit", "execute"],
    extraTools: [REPORT_TOOL],
    deniedHint: "Do not retry; choose a different approach or ask the user.",
  },
};

export const getAgentMode = (id: AgentModeId): AgentMode => MODES[id];

export const listAgentModes = (): AgentMode[] => AGENT_MODE_IDS.map(getAgentMode);

// ---- Enforcement -----------------------------------------------------------------

/** Whether the active agent mode (none = the general agent, which has no limit) may use this tool. */
export function isToolAllowed(agent: AgentModeId | undefined, tool: { name: string; kind: ToolKind }): boolean {
  if (!agent) return true;
  const mode = getAgentMode(agent);
  return mode.allowedKinds.includes(tool.kind) || mode.extraTools.includes(tool.name);
}

/** The message for a call the active agent mode may not make; says what happened and what to do instead. */
export function agentDeniedMessage(agent: AgentModeId, toolName: string, kind: ToolKind): string {
  return `The ${agent} agent may not use ${toolName} (${kind} tool). ${getAgentMode(agent).deniedHint}`;
}
