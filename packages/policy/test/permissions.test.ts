import { describe, expect, it } from "vitest";
import { decidePermission, isPermissionMode, matchRule, primaryArgument } from "../src/permissions.js";

const read = { name: "read_file", kind: "read" as const };
const edit = { name: "edit_file", kind: "edit" as const };
const run = { name: "run_command", kind: "execute" as const };
const none = { allow: [], deny: [] };

describe("isPermissionMode", () => {
  it("accepts the four modes and rejects everything else", () => {
    for (const mode of ["default", "acceptEdits", "plan", "bypassPermissions"]) expect(isPermissionMode(mode)).toBe(true);
    expect(isPermissionMode("yolo")).toBe(false);
    expect(isPermissionMode(undefined)).toBe(false);
  });
});

describe("primaryArgument", () => {
  it("prefers the command, then the path-like arguments", () => {
    expect(primaryArgument({ command: "ls", path: "a" })).toBe("ls");
    expect(primaryArgument({ path: "a.ts" })).toBe("a.ts");
    expect(primaryArgument({ from: "a", to: "b" })).toBe("a");
    expect(primaryArgument({ pattern: "**/*.ts" })).toBe("**/*.ts");
    expect(primaryArgument({})).toBe("");
  });
});

describe("matchRule", () => {
  it("matches by tool name alone", () => {
    expect(matchRule("run_command", "run_command", { command: "anything" })).toBe(true);
    expect(matchRule("run_command", "read_file", {})).toBe(false);
  });

  it("matches exact, prefix:* and * patterns", () => {
    expect(matchRule("run_command(npm test)", "run_command", { command: "npm test" })).toBe(true);
    expect(matchRule("run_command(npm test)", "run_command", { command: "npm test -- x" })).toBe(false);
    expect(matchRule("run_command(npm test:*)", "run_command", { command: "npm test -- x" })).toBe(true);
    expect(matchRule("read_file(src/*)", "read_file", { path: "src/a.ts" })).toBe(true);
    expect(matchRule("read_file(src/*)", "read_file", { path: "lib/a.ts" })).toBe(false);
  });
});

describe("decidePermission", () => {
  it("allows reads and asks for edits and commands in default mode", () => {
    expect(decidePermission(read, {}, "default", none)).toBe("allow");
    expect(decidePermission(edit, { path: "a" }, "default", none)).toBe("ask");
    expect(decidePermission(run, { command: "ls" }, "default", none)).toBe("ask");
  });

  it("deny rules beat everything, including bypassPermissions", () => {
    const rules = { allow: ["run_command"], deny: ["run_command(rm:*)"] };
    expect(decidePermission(run, { command: "rm -rf x" }, "bypassPermissions", rules)).toBe("deny");
    expect(decidePermission(run, { command: "ls" }, "default", rules)).toBe("allow");
  });

  it("bypassPermissions allows everything not denied", () => {
    expect(decidePermission(run, { command: "ls" }, "bypassPermissions", none)).toBe("allow");
    expect(decidePermission(edit, {}, "bypassPermissions", none)).toBe("allow");
  });

  it("plan mode only allows reads, even with allow rules", () => {
    expect(decidePermission(read, {}, "plan", none)).toBe("allow");
    expect(decidePermission(edit, {}, "plan", { allow: ["edit_file"], deny: [] })).toBe("deny");
    expect(decidePermission(run, { command: "ls" }, "plan", none)).toBe("deny");
  });

  it("acceptEdits auto-allows edits but still asks for commands", () => {
    expect(decidePermission(edit, {}, "acceptEdits", none)).toBe("allow");
    expect(decidePermission(run, { command: "ls" }, "acceptEdits", none)).toBe("ask");
  });

  it("an allow rule lets a matching call through in default mode", () => {
    expect(decidePermission(run, { command: "npm test" }, "default", { allow: ["run_command(npm test:*)"], deny: [] })).toBe("allow");
    expect(decidePermission(run, { command: "rm x" }, "default", { allow: ["run_command(npm test:*)"], deny: [] })).toBe("ask");
  });
});
