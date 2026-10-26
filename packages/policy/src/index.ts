/**
 * @cortex/policy — what is allowed to happen during an agent turn: permission modes and rules that
 * decide whether a tool call runs, and hooks that let the user veto or observe it.
 */

export { PERMISSION_MODES } from "./types.js";
export type { Decision, HookDef, HookEvent, HookOutcome, PermissionMode, PermissionRules } from "./types.js";
export { decidePermission, isPermissionMode, matchRule, primaryArgument } from "./permissions.js";
export { runHooks } from "./hooks.js";
