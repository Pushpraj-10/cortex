/**
 * Hooks: user-configured shell commands that run at fixed points in a turn. A hook receives the
 * event as JSON on stdin; exit code 2 blocks (a PreToolUse hook blocks the tool call, and its
 * stderr is fed back to the model). Any other exit code is ignored.
 *
 * One exception, for the hooks that gate something (PreToolUse and UserPromptSubmit): a hook that could not
 * do its job at all — it would not start, was not found, did not finish in time, or was killed — blocks, because
 * a check that never ran has not approved anything. A hook that crashes quietly must not turn a safety check into a no-op.
 */
import { spawn } from "node:child_process";
import type { HookDef, HookEvent, HookOutcome } from "./types.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const BLOCKING_EXIT_CODE = 2;
/** What a shell reports for "command not found" and "found but not executable": the hook did not run. */
const COULD_NOT_RUN_EXIT_CODES = [126, 127];
/** Hooks whose job is to say no; for the others (PostToolUse, Stop) the thing has already happened, so there is nothing to block. */
const GATING_EVENTS: readonly HookEvent[] = ["PreToolUse", "UserPromptSubmit"];
/** Most of a hook's stderr kept (it goes to the model on a block); the rest is discarded as it arrives, so a noisy hook cannot grow memory. */
const MAX_STDERR_CHARS = 64 * 1024;
/** Longest hook command quoted in a message. */
const MAX_COMMAND_IN_MESSAGE = 80;

interface HookCommandResult {
  /** The exit code; 1 when there was none, which does not count as a block. */
  code: number;
  stderr: string;
  /** Why the hook did not run to completion (not just "exited non-zero"): set for a spawn error, a timeout, a signal, or a missing command. */
  failure?: string;
}

/** Runs one hook command with `payload` as JSON on stdin. Never rejects; whatever went wrong comes back as `failure`. */
function runHookCommand(command: string, payload: unknown, cwd: string, timeoutMs: number): Promise<HookCommandResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HookCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(command, { shell: true, cwd });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      // Do not wait for the streams to close: a grandchild that inherited them would keep this hook "running" long after it was killed.
      finish({ code: 1, stderr, failure: `it did not finish within ${timeoutMs < 1000 ? `${timeoutMs}ms` : `${Math.round(timeoutMs / 1000)}s`}` });
    }, timeoutMs);

    child.stdout.resume(); // its output is not used, but an unread pipe fills up and stops the hook
    child.stderr.on("data", (chunk) => {
      if (stderr.length < MAX_STDERR_CHARS) stderr = (stderr + chunk).slice(0, MAX_STDERR_CHARS);
    });
    child.on("error", (error) => finish({ code: 1, stderr, failure: `it could not be started (${error.message})` }));
    child.on("close", (code, signal) => {
      if (signal) return finish({ code: 1, stderr, failure: `it was stopped by ${signal}` });
      if (code !== null && COULD_NOT_RUN_EXIT_CODES.includes(code)) {
        return finish({ code, stderr, failure: `the shell could not run it (exit code ${code}: command not found or not executable)` });
      }
      finish({ code: code ?? 1, stderr });
    });
    child.stdin.on("error", () => {}); // a hook that exits without reading stdin is fine
    child.stdin.end(JSON.stringify(payload));
  });
}

const shorten = (text: string) => (text.length > MAX_COMMAND_IN_MESSAGE ? `${text.slice(0, MAX_COMMAND_IN_MESSAGE)}…` : text);

const blockedBecauseItDidNotRun = (event: HookEvent, hook: HookDef, why: string): HookOutcome => ({
  blocked: true,
  message: `The ${event} hook "${shorten(hook.command)}" did not run: ${why}. It is treated as blocking, since a check that cannot run cannot approve anything. Fix or remove the hook in .cortex/settings.json.`,
});

/**
 * Runs every hook registered for `event` (and matching the tool name, if it has a matcher), stopping at the first that blocks.
 * A hook blocks by exiting with code 2; a PreToolUse or UserPromptSubmit hook also blocks when it could not run at all.
 */
export async function runHooks(
  hooks: HookDef[],
  event: HookEvent,
  payload: { tool_name?: string } & Record<string, unknown>,
  cwd: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HookOutcome> {
  const gating = GATING_EVENTS.includes(event);

  for (const hook of hooks) {
    if (hook.event !== event) continue;

    if (hook.matcher) {
      let matches: boolean;
      try {
        matches = new RegExp(`^(?:${hook.matcher})$`).test(payload.tool_name ?? "");
      } catch {
        // Settings are checked when they load, so this is a hook defined some other way. It cannot say which calls it covers.
        if (gating) return blockedBecauseItDidNotRun(event, hook, `its matcher "${shorten(hook.matcher)}" is not a valid regular expression`);
        continue;
      }
      if (!matches) continue;
    }

    const run = await runHookCommand(hook.command, { hook_event_name: event, ...payload }, cwd, timeoutMs);
    if (run.failure && gating) return blockedBecauseItDidNotRun(event, hook, run.failure);
    if (run.code === BLOCKING_EXIT_CODE) return { blocked: true, message: run.stderr.trim() || `Blocked by ${event} hook` };
  }
  return { blocked: false, message: "" };
}
