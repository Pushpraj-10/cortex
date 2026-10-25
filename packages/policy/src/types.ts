/** Contracts for the two things that gate a tool call: permission decisions and hooks. */

// ---- Permissions -----------------------------------------------------------------

export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;

/**
 * - `default`: reads run freely; edits and commands ask
 * - `acceptEdits`: reads and edits run freely; commands ask
 * - `plan`: only reads run; everything else is denied (the model should produce a plan)
 * - `bypassPermissions`: everything runs, except what a deny rule forbids
 */
export type PermissionMode = (typeof PERMISSION_MODES)[number];

export type Decision = "allow" | "deny" | "ask";

/** Rules look like `run_command`, `run_command(npm test:*)`, `read_file(src/*)`. */
export interface PermissionRules {
  allow: string[];
  deny: string[];
}

// ---- Hooks -----------------------------------------------------------------------

export type HookEvent = "PreToolUse" | "PostToolUse" | "UserPromptSubmit" | "Stop";

export interface HookDef {
  event: HookEvent;
  /** Tool-name regex; only meaningful for Pre/PostToolUse. Omit to match all. */
  matcher?: string;
  command: string;
}

export interface HookOutcome {
  blocked: boolean;
  /** stderr of the blocking hook, fed back to the model. */
  message: string;
}
