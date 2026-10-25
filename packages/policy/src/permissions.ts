/**
 * Permission decisions: whether a tool call runs, is refused, or needs the user's approval.
 * Decisions depend on the tool's `kind` (read / edit / execute), never on its name, so adding
 * a tool never means touching policy.
 */
import type { ToolKind } from "@cortex/tools";
import { PERMISSION_MODES, type Decision, type PermissionMode, type PermissionRules } from "./types.js";

export function isPermissionMode(value: unknown): value is PermissionMode {
  return (PERMISSION_MODES as readonly unknown[]).includes(value);
}

// ---- Rules -----------------------------------------------------------------------

/** The argument a rule's pattern is matched against: the command, or else the path-like argument. */
export function primaryArgument(input: Record<string, unknown>): string {
  return String(input.command ?? input.path ?? input.from ?? input.pattern ?? "");
}

/**
 * `run_command`             -> any call of that tool
 * `run_command(npm test)`   -> exactly that command
 * `run_command(npm test:*)` -> a command starting with "npm test"
 * `read_file(src/*)`        -> a path starting with "src/"
 */
export function matchRule(rule: string, toolName: string, input: Record<string, unknown>): boolean {
  const match = /^([^()]+?)(?:\((.*)\))?$/.exec(rule.trim());
  if (!match || match[1] !== toolName) return false;
  const pattern = match[2];
  if (pattern === undefined) return true;

  const argument = primaryArgument(input);
  if (pattern.endsWith(":*")) return argument.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith("*")) return argument.startsWith(pattern.slice(0, -1));
  return argument === pattern;
}

// ---- Decision --------------------------------------------------------------------

/**
 * Order of precedence: deny rules, bypass mode, plan mode, allow rules, reads, acceptEdits, then ask.
 * A deny rule wins over everything, including `bypassPermissions`.
 */
export function decidePermission(
  tool: { name: string; kind: ToolKind },
  input: Record<string, unknown>,
  mode: PermissionMode,
  rules: PermissionRules,
): Decision {
  if (rules.deny.some((rule) => matchRule(rule, tool.name, input))) return "deny";
  if (mode === "bypassPermissions") return "allow";
  if (mode === "plan") return tool.kind === "read" ? "allow" : "deny";
  if (rules.allow.some((rule) => matchRule(rule, tool.name, input))) return "allow";
  if (tool.kind === "read") return "allow";
  if (mode === "acceptEdits" && tool.kind === "edit") return "allow";
  return "ask";
}
