import { runHookCommand } from "./run-hook-command";
import type { HookDef, HookEvent, HookOutcome } from "./types";

/**
 * Runs every matching hook with the event payload as JSON on stdin.
 * Exit code 2 blocks (PreToolUse: the tool call; others: reported back). Other non-zero codes are ignored.
 */
export async function runHooks(
  hooks: HookDef[],
  event: HookEvent,
  payload: { tool_name?: string } & Record<string, unknown>,
  cwd: string,
  timeoutMs = 60_000,
): Promise<HookOutcome> {
  for (const hook of hooks) {
    if (hook.event !== event) continue;
    if (hook.matcher && !new RegExp(`^(?:${hook.matcher})$`).test(payload.tool_name ?? "")) continue;
    const { code, stderr } = await runHookCommand(hook.command, { hook_event_name: event, ...payload }, cwd, timeoutMs);
    if (code === 2) return { blocked: true, message: stderr.trim() || `Blocked by ${event} hook` };
  }
  return { blocked: false, message: "" };
}
