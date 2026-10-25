import { matchRule } from "./match-rule";
import type { Decision, PermissionMode, PermissionRules } from "./types";

const EDIT_TOOLS = new Set(["Write", "Edit"]);

/** Order: deny rules > bypass > plan mode > allow rules > read-only > acceptEdits > ask. */
export function decidePermission(
  tool: { name: string; readOnly: boolean },
  input: Record<string, unknown>,
  mode: PermissionMode,
  rules: PermissionRules,
): Decision {
  if (rules.deny.some((r) => matchRule(r, tool.name, input))) return "deny";
  if (mode === "bypassPermissions") return "allow";
  if (mode === "plan") return tool.readOnly ? "allow" : "deny";
  if (rules.allow.some((r) => matchRule(r, tool.name, input))) return "allow";
  if (tool.readOnly) return "allow";
  if (mode === "acceptEdits" && EDIT_TOOLS.has(tool.name)) return "allow";
  return "ask";
}
