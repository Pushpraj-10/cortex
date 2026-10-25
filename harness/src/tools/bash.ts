import { exec } from "node:child_process";
import type { ToolDef } from "./types";

export const bashTool: ToolDef = {
  name: "Bash",
  description: "Run a shell command in the working directory. Returns combined stdout/stderr and the exit code.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: { command: { type: "string" }, timeout_ms: { type: "number", description: "default 120000" } },
    required: ["command"],
  },
  run(input, ctx) {
    return new Promise((resolve) => {
      exec(
        String(input.command),
        { cwd: ctx.cwd, timeout: Number(input.timeout_ms ?? 120_000), maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const code = err ? ((err as { code?: number }).code ?? 1) : 0;
          resolve(`${stdout}${stderr}`.trimEnd() + `\n[exit code: ${code}]`);
        },
      );
    });
  },
};
