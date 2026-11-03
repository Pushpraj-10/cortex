import { describe, expect, it, vi } from "vitest";
import { MAX_TIMEOUT_MS, effectiveTimeoutMs, runCommandTool } from "../src/shell.js";

// The real exec, wrapped to remember the options it was given, so a test can see what limit reached the operating system.
const execCalls = vi.hoisted(() => [] as { timeout?: number; maxBuffer?: number }[]);
vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return {
    ...real,
    exec: ((command: string, options: { timeout?: number; maxBuffer?: number }, callback: never) => {
      execCalls.push({ timeout: options.timeout, maxBuffer: options.maxBuffer });
      return (real.exec as unknown as (...args: unknown[]) => unknown)(command, options, callback);
    }) as typeof real.exec,
  };
});

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

describe("effectiveTimeoutMs", () => {
  it("keeps a sensible request, whole milliseconds", () => {
    expect(effectiveTimeoutMs(1)).toBe(1);
    expect(effectiveTimeoutMs(5_000)).toBe(5_000);
    expect(effectiveTimeoutMs(1500.9)).toBe(1500);
    expect(effectiveTimeoutMs(MAX_TIMEOUT_MS)).toBe(MAX_TIMEOUT_MS);
  });

  it("never allows more than the ceiling, however large the request", () => {
    for (const requested of [MAX_TIMEOUT_MS + 1, 3_600_000, 1e12, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]) {
      expect(effectiveTimeoutMs(requested), String(requested)).toBe(MAX_TIMEOUT_MS);
    }
  });

  it("falls back to the default for anything that would mean 'no limit' or is not a usable number", () => {
    for (const requested of [undefined, null, 0, -1, -1e9, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "5000", "1e9", {}, [], true]) {
      expect(effectiveTimeoutMs(requested), String(requested)).toBe(120_000);
    }
  });

  it("has a ceiling of ten minutes", () => {
    expect(MAX_TIMEOUT_MS).toBe(600_000);
  });
});

describe("runCommandTool: the limit it gives the operating system", () => {
  const timeoutGiven = async (timeoutMs: unknown) => {
    await runCommandTool.handler({ command: node("0"), timeoutMs } as { command: string; timeoutMs?: number }, context);
    return execCalls.at(-1)?.timeout;
  };

  it("uses the default when none is asked for, and when the ask would mean no limit", async () => {
    expect(await timeoutGiven(undefined)).toBe(120_000);
    expect(await timeoutGiven(0)).toBe(120_000);
    expect(await timeoutGiven(-5)).toBe(120_000);
    expect(await timeoutGiven("never")).toBe(120_000);
  });

  it("passes on a reasonable request, and cuts a huge one to the ceiling", async () => {
    expect(await timeoutGiven(500)).toBe(500);
    expect(await timeoutGiven(1e12)).toBe(MAX_TIMEOUT_MS);
  });

  it("tells the model about the ceiling", () => {
    expect(JSON.stringify(runCommandTool.parametersSchema)).toContain(`at most ${MAX_TIMEOUT_MS}`);
  });
});

describe("runCommandTool: why a command was stopped", () => {
  it("says 'timed out' only when the clock stopped it", async () => {
    const result = await runCommandTool.handler({ command: node("setTimeout(()=>{},10000)"), timeoutMs: 200 }, context);
    expect(result.ok && result.value.timedOut).toBe(true);
  });

  it("stops a command that writes too much, keeps what it wrote, says so, and does not call that a timeout", async () => {
    const result = await runCommandTool.handler({ command: node("process.stdout.write('x'.repeat(11*1024*1024))") }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.timedOut).toBe(false);
    expect(result.value.exitCode).not.toBe(0);
    expect(result.value.output.endsWith("[output stopped at 10 MiB and the command was stopped]")).toBe(true);
    expect(result.value.output.length).toBeLessThan(11 * 1024 * 1024);
  });

  it("does not call a command the caller cancelled a timeout", async () => {
    const controller = new AbortController();
    const running = runCommandTool.handler({ command: node("setTimeout(()=>{},10000)") }, { cwd: process.cwd(), signal: controller.signal });
    setTimeout(() => controller.abort(), 200);

    const result = await running;

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timedOut).toBe(false);
      expect(result.value.exitCode).not.toBe(0);
    }
  });
});
