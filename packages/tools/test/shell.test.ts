import { describe, expect, it } from "vitest";
import { runCommandTool } from "../src/shell.js";

const context = { cwd: process.cwd() };
const node = (script: string) => `node -e "${script}"`;

describe("runCommandTool", () => {
  it("is an execute-kind tool", () => {
    expect(runCommandTool.kind).toBe("execute");
  });

  it("returns combined output and exit code 0 on success", async () => {
    const result = await runCommandTool.handler({ command: node("console.log('out');console.error('err')") }, context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.output).toContain("out");
      expect(result.value.output).toContain("err");
      expect(result.value.timedOut).toBe(false);
    }
  });

  it("reports a non-zero exit code as a result, not an error", async () => {
    const result = await runCommandTool.handler({ command: node("process.exit(3)") }, context);
    expect(result).toEqual({ ok: true, value: { output: "", exitCode: 3, timedOut: false } });
  });

  it("runs in the context's working directory", async () => {
    const result = await runCommandTool.handler({ command: node("console.log(process.cwd())") }, { cwd: process.cwd() });
    expect(result.ok && result.value.output).toBe(process.cwd());
  });

  it("kills a command that exceeds the timeout and flags it", async () => {
    const result = await runCommandTool.handler({ command: node("setTimeout(()=>{},10000)"), timeoutMs: 200 }, context);
    expect(result.ok && result.value.timedOut).toBe(true);
  });

  it("summarizes long commands with an ellipsis", () => {
    expect(runCommandTool.summarize!({ command: "ls" })).toBe("Run ls");
    expect(runCommandTool.summarize!({ command: "x".repeat(100) })).toBe(`Run ${"x".repeat(80)}…`);
  });
});

describe("runCommandTool.preview", () => {
  it("shows the command that is about to run", async () => {
    expect(await runCommandTool.preview!({ command: "npm test" }, context)).toEqual({ kind: "command", command: "npm test" });
  });

  it("returns nothing for a call with no command, instead of throwing", async () => {
    expect(await runCommandTool.preview!({} as { command: string }, context)).toBeUndefined();
  });
});
