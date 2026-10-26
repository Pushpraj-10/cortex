/**
 * What the approval window offers for a tool call, and what each answer remembers. The choices come from the tool's `kind`
 * and arguments, never from its name, like the permission policy itself:
 *   1. Yes
 *   2. Yes, and don't ask again ... (only for an edit or a command, and scoped as tightly as the rules can express)
 *   3. No
 */
import { primaryArgument } from "@cortex/policy";
import type { ToolKind } from "@cortex/tools";

export interface PermissionChoice {
  label: string;
  /** Dimmed after the label: the key that picks this choice without moving to it. */
  hint?: string;
  allow: boolean;
  /** What to remember for the rest of the session when this choice is picked. */
  remember?: { mode: "acceptEdits" } | { rule: string };
}

const YES: PermissionChoice = { label: "Yes", allow: true };
const NO: PermissionChoice = { label: "No", hint: "esc", allow: false };

/** The "don't ask again" choice for this call, or undefined when nothing safe can be remembered for it. */
function rememberChoice(toolName: string, kind: ToolKind | undefined, args: unknown): PermissionChoice | undefined {
  if (kind === "edit") {
    return { label: "Yes, and don't ask again for edits this session", hint: "shift+tab", allow: true, remember: { mode: "acceptEdits" } };
  }
  if (kind !== "execute") return undefined;

  const input = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
  const argument = primaryArgument(input);
  // No argument to pin the rule to: it can only be about the whole tool.
  if (argument === "") {
    return { label: `Yes, and don't ask again for ${toolName} this session`, hint: "shift+tab", allow: true, remember: { rule: toolName } };
  }
  // A rule cannot hold a line break, and one ending in `*` would match more than this call.
  if (argument.includes("\n") || argument.endsWith("*")) return undefined;
  const what = typeof input.command === "string" ? "command" : "call";
  return { label: `Yes, and don't ask again for this exact ${what} this session`, hint: "shift+tab", allow: true, remember: { rule: `${toolName}(${argument})` } };
}

export function permissionChoices(toolName: string, kind: ToolKind | undefined, args: unknown): PermissionChoice[] {
  const remember = rememberChoice(toolName, kind, args);
  return remember ? [YES, remember, NO] : [YES, NO];
}
