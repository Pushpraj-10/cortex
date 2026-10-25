/**
 * Hooks: user-configured shell commands that run at fixed points in a turn. A hook receives the
 * event as JSON on stdin; exit code 2 blocks (a PreToolUse hook blocks the tool call, and its
 * stderr is fed back to the model). Any other exit code is ignored.
 */
import { spawn } from "node:child_process";
import type { HookDef, HookEvent, HookOutcome } from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const BLOCKING_EXIT_CODE = 2;

interface HookCommandResult {
  code: number;
  stderr: string;
}

/** Runs one hook command with `payload` as JSON on stdin. Timeouts and spawn errors resolve as non-zero, never reject. */
function runHookCommand(command: string, payload: unknown, cwd: string, timeoutMs: number): Promise<HookCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => resolve({ code: 1, stderr: String(error) }));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
    child.stdin.on("error", () => {}); // a hook that exits without reading stdin is fine
    child.stdin.end(JSON.stringify(payload));
  });
}

/** Runs every hook registered for `event` (and matching the tool name, if it has a matcher), stopping at the first that blocks. */
export async function runHooks(
  hooks: HookDef[],
  event: HookEvent,
  payload: { tool_name?: string } & Record<string, unknown>,
  cwd: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HookOutcome> {
  for (const hook of hooks) {
    if (hook.event !== event) continue;
    if (hook.matcher && !new RegExp(`^(?:${hook.matcher})$`).test(payload.tool_name ?? "")) continue;

    const { code, stderr } = await runHookCommand(hook.command, { hook_event_name: event, ...payload }, cwd, timeoutMs);
    if (code === BLOCKING_EXIT_CODE) return { blocked: true, message: stderr.trim() || `Blocked by ${event} hook` };
  }
  return { blocked: false, message: "" };
}
