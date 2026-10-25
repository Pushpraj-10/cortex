/**
 * Shell execution. This is the one tool that is not confined to the workspace — a command can
 * do anything — which is why it is `kind: "execute"` and goes through approval.
 */
import { exec } from "node:child_process";
import { defineTool } from "./define-tool.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_SUMMARY_CHARS = 80;

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
      timeoutMs: { type: "number", description: `Kill the command after this many milliseconds (default ${DEFAULT_TIMEOUT_MS})` },
    },
    required: ["command"],
  },
  summarize: (args) => {
    const command = typeof args?.command === "string" ? args.command : "?";
    return `Run ${command.length > MAX_SUMMARY_CHARS ? `${command.slice(0, MAX_SUMMARY_CHARS)}…` : command}`;
  },
  failure: (args) => `Failed to run command ${args.command}`,
  run(args, context) {
    return new Promise((resolve) => {
      exec(
        args.command,
        { cwd: context.cwd, timeout: args.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, signal: context.signal },
        (error, stdout, stderr) => {
          const exitCode = error ? (typeof error.code === "number" ? error.code : 1) : 0;
          resolve({ output: `${stdout}${stderr}`.trimEnd(), exitCode, timedOut: Boolean(error?.killed) });
        },
      );
    });
  },
});
