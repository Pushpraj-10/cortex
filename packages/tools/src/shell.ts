/**
 * Shell execution. This is the one tool that is not confined to the workspace — a command can
 * do anything — which is why it is `kind: "execute"` and goes through approval.
 */
import { exec } from "node:child_process";
import { defineTool } from "./define-tool.js";

const DEFAULT_TIMEOUT_MS = 120_000;
/** The longest a command may be given. The model chooses `timeoutMs`, and with no ceiling "0" or a huge number means "never stop it". */
export const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_SUMMARY_CHARS = 80;

/** The timeout to use for what was asked: the default for anything that is not a positive number, never more than the ceiling. */
export function effectiveTimeoutMs(requested: unknown): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested < 1) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.floor(requested), MAX_TIMEOUT_MS);
}

export interface RunCommandResult {
  /** Combined stdout and stderr. */
  output: string;
  /** 0 on success. Non-zero is reported, not thrown, so the model can read the output and react. */
  exitCode: number;
  timedOut: boolean;
}

export const runCommandTool = defineTool<{ command: string; timeoutMs?: number }, RunCommandResult>({
  name: "run_command",
  description: "Run a shell command in the workspace root. Returns its combined output and exit code.",
  kind: "execute",
  parametersSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run" },
      timeoutMs: { type: "number", description: `Kill the command after this many milliseconds (default ${DEFAULT_TIMEOUT_MS}, at most ${MAX_TIMEOUT_MS})` },
    },
    required: ["command"],
  },
  summarize: (args) => {
    const command = typeof args?.command === "string" ? args.command : "?";
    return `Run ${command.length > MAX_SUMMARY_CHARS ? `${command.slice(0, MAX_SUMMARY_CHARS)}…` : command}`;
  },
  async preview(args) {
    return typeof args?.command === "string" ? { kind: "command", command: args.command } : undefined;
  },
  failure: (args) => `Failed to run command ${args.command}`,
  run(args, context) {
    return new Promise((resolve) => {
      exec(
        args.command,
        { cwd: context.cwd, timeout: effectiveTimeoutMs(args.timeoutMs), maxBuffer: MAX_OUTPUT_BYTES, signal: context.signal },
        (error, stdout, stderr) => {
          const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0;
          // exec kills the command for three reasons, and only one is the clock: too much output, or the caller cancelling, are not a timeout.
          const code = (error as NodeJS.ErrnoException | null)?.code;
          const tooMuchOutput = code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
          const cancelled = code === "ABORT_ERR";
          const output = `${stdout}${stderr}`.trimEnd();
          resolve({
            output: tooMuchOutput ? `${output}\n[output stopped at ${MAX_OUTPUT_BYTES / 1024 / 1024} MiB and the command was stopped]` : output,
            exitCode,
            timedOut: Boolean(error?.killed) && !tooMuchOutput && !cancelled,
          });
        },
      );
    });
  },
});
