export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];
export type Decision = "allow" | "deny" | "ask";

/** Rules look like `Bash`, `Bash(npm test:*)`, `Read(src/*)`. */
export interface PermissionRules {
  allow: string[];
  deny: string[];
}
