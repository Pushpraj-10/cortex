import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runHooks } from "../src/hooks.js";
import type { HookDef } from "../src/types.js";

const exit = (code: number, message = "") => `node -e "process.stderr.write('${message}');process.exit(${code})"`;

describe("runHooks", () => {
  it("blocks on exit code 2 and surfaces stderr", async () => {
    const hooks: HookDef[] = [{ event: "PreToolUse", matcher: "run_command", command: exit(2, "no rm") }];
    const outcome = await runHooks(hooks, "PreToolUse", { tool_name: "run_command" }, process.cwd());
    expect(outcome).toEqual({ blocked: true, message: "no rm" });
  });

  it("uses a default message when the blocking hook wrote nothing to stderr", async () => {
    const outcome = await runHooks([{ event: "Stop", command: exit(2) }], "Stop", {}, process.cwd());
    expect(outcome).toEqual({ blocked: true, message: "Blocked by Stop hook" });
  });

  it("ignores other exit codes, other events and non-matching tools", async () => {
    const hooks: HookDef[] = [
      { event: "PreToolUse", command: exit(1) },
      { event: "PostToolUse", command: exit(2) },
      { event: "PreToolUse", matcher: "write_file", command: exit(2) },
    ];
    expect((await runHooks(hooks, "PreToolUse", { tool_name: "run_command" }, process.cwd())).blocked).toBe(false);
  });

  it("matches the tool-name regex against the whole name, not a substring", async () => {
    const hooks: HookDef[] = [{ event: "PreToolUse", matcher: "edit", command: exit(2) }];
    expect((await runHooks(hooks, "PreToolUse", { tool_name: "edit_file" }, process.cwd())).blocked).toBe(false);
    expect((await runHooks(hooks, "PreToolUse", { tool_name: "edit" }, process.cwd())).blocked).toBe(true);
  });

  it("passes the event and payload to the hook as JSON on stdin", async () => {
    // exits 2 only if stdin carries the expected event name and tool name
    const script =
      "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.exit(j.hook_event_name==='PreToolUse'&&j.tool_name==='t'?2:0)})";
    const outcome = await runHooks([{ event: "PreToolUse", command: `node -e "${script}"` }], "PreToolUse", { tool_name: "t" }, process.cwd());
    expect(outcome.blocked).toBe(true);
  });
});

describe("runHooks: a hook that could not do its job", () => {
  const cwd = process.cwd();
  const gate: HookDef = { event: "PreToolUse", command: exit(0) };

  it.each([126, 127])("blocks a PreToolUse call when the shell says the hook could not run (exit code %i), and says why", async (code) => {
    const outcome = await runHooks([{ event: "PreToolUse", command: exit(code) }], "PreToolUse", { tool_name: "run_command" }, cwd);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("The PreToolUse hook");
    expect(outcome.message).toContain("did not run");
    expect(outcome.message).toContain(`exit code ${code}`);
    expect(outcome.message).toContain("cannot approve anything");
  });

  it("blocks when the hook cannot be started at all", async () => {
    const missing = path.join(os.tmpdir(), "cortex-no-such-folder-for-a-hook", "nested");
    const outcome = await runHooks([gate], "PreToolUse", { tool_name: "run_command" }, missing);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("could not be started");
  });

  it("blocks when the hook does not finish in time, and does not wait for its children", async () => {
    const started = Date.now();
    const hang = { event: "PreToolUse" as const, command: `node -e "setInterval(() => {}, 1000)"` };
    const outcome = await runHooks([hang], "PreToolUse", { tool_name: "run_command" }, cwd, 300);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("did not finish within 300ms");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it.skipIf(process.platform === "win32")("blocks when the hook is killed by a signal", async () => {
    const killed = { event: "PreToolUse" as const, command: `node -e "process.kill(process.pid, 'SIGKILL')"` };
    const outcome = await runHooks([killed], "PreToolUse", { tool_name: "run_command" }, cwd);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("SIGKILL");
  });

  it("holds for UserPromptSubmit too, which can also stop a turn", async () => {
    const outcome = await runHooks([{ event: "UserPromptSubmit", command: exit(127) }], "UserPromptSubmit", { prompt: "hi" }, cwd);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("The UserPromptSubmit hook");
  });

  it("does not block the hooks that run after the fact, which have nothing left to stop", async () => {
    for (const event of ["PostToolUse", "Stop"] as const) {
      const outcome = await runHooks([{ event, command: exit(127) }], event, { tool_name: "run_command" }, cwd);
      expect(outcome, event).toEqual({ blocked: false, message: "" });
    }
    const missing = path.join(os.tmpdir(), "cortex-no-such-folder-for-a-hook");
    expect((await runHooks([{ event: "PostToolUse", command: exit(0) }], "PostToolUse", {}, missing)).blocked).toBe(false);
  });

  it("still ignores an ordinary non-zero exit, as documented: only 2 blocks", async () => {
    for (const code of [1, 3, 5, 125, 128, 255]) {
      const outcome = await runHooks([{ event: "PreToolUse", command: exit(code) }], "PreToolUse", { tool_name: "t" }, cwd);
      expect(outcome.blocked, `exit ${code}`).toBe(false);
    }
  });

  it("passes a hook that ran and exited 0", async () => {
    expect(await runHooks([gate], "PreToolUse", { tool_name: "run_command" }, cwd)).toEqual({ blocked: false, message: "" });
  });

  it("stops at the first hook that failed, and never runs a later one", async () => {
    const outcome = await runHooks([{ event: "PreToolUse", command: exit(127) }, { event: "PreToolUse", command: exit(2, "second hook ran") }], "PreToolUse", { tool_name: "t" }, cwd);
    expect(outcome.message).toContain("did not run");
    expect(outcome.message).not.toContain("second hook ran");
  });

  it("quotes a long command shortened in its message", async () => {
    const long = `node -e "process.exit(127)" ${"x".repeat(300)}`;
    const outcome = await runHooks([{ event: "PreToolUse", command: long }], "PreToolUse", { tool_name: "t" }, cwd);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("…");
    expect(outcome.message.length).toBeLessThan(500);
  });

  it("blocks a gating hook whose matcher is not a valid regular expression, instead of throwing, and ignores it elsewhere", async () => {
    const broken: HookDef = { event: "PreToolUse", matcher: "(unclosed", command: exit(0) };
    const outcome = await runHooks([broken], "PreToolUse", { tool_name: "run_command" }, cwd);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message).toContain("not a valid regular expression");

    const after = await runHooks([{ ...broken, event: "PostToolUse" }], "PostToolUse", { tool_name: "run_command" }, cwd);
    expect(after.blocked).toBe(false);
  });

  it("is not stopped by a hook that writes a lot to stdout and stderr, and keeps only a bounded part of the stderr", async () => {
    const noisy = { event: "PreToolUse" as const, command: `node -e "process.stdout.write('o'.repeat(300000));process.stderr.write('e'.repeat(300000));process.exit(2)"` };
    const outcome = await runHooks([noisy], "PreToolUse", { tool_name: "t" }, cwd);
    expect(outcome.blocked).toBe(true);
    expect(outcome.message.length).toBeLessThanOrEqual(64 * 1024);
    expect(outcome.message.startsWith("eee")).toBe(true);
  });
});
