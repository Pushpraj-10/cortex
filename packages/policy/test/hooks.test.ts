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
