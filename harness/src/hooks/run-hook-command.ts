import { spawn } from "node:child_process";

export interface HookCommandResult {
  code: number;
  stderr: string;
}

/** Runs one hook command with `payload` as JSON on stdin. Timeouts and spawn errors resolve as non-zero, never reject. */
export function runHookCommand(command: string, payload: unknown, cwd: string, timeoutMs: number): Promise<HookCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd });
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => resolve({ code: 1, stderr: String(e) }));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(payload));
  });
}
