import { describe, expect, it } from "vitest";
import { runHooks } from "../../src/hooks/run-hooks";
import type { HookDef } from "../../src/hooks/types";

const exit = (code: number, msg = "") => `node -e "process.stderr.write('${msg}');process.exit(${code})"`;

describe("runHooks", () => {
  it("blocks on exit code 2 and surfaces stderr", async () => {
    const hooks: HookDef[] = [{ event: "PreToolUse", matcher: "Bash", command: exit(2, "no rm") }];
    const out = await runHooks(hooks, "PreToolUse", { tool_name: "Bash" }, process.cwd());
    expect(out).toEqual({ blocked: true, message: "no rm" });
  });

  it("ignores other exit codes, other events and non-matching tools", async () => {
    const hooks: HookDef[] = [
      { event: "PreToolUse", command: exit(1) },
      { event: "PostToolUse", command: exit(2) },
      { event: "PreToolUse", matcher: "Write", command: exit(2) },
    ];
    expect((await runHooks(hooks, "PreToolUse", { tool_name: "Bash" }, process.cwd())).blocked).toBe(false);
  });
});
