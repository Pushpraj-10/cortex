import { describe, expect, it } from "vitest";
import { matchRule } from "@cortex/policy";
import { permissionChoices } from "../../src/format/permission-choices.js";

describe("permissionChoices", () => {
  it("offers yes, yes-for-edits-this-session, and no for an edit", () => {
    const choices = permissionChoices("edit_file", "edit", { path: "a.ts" });
    expect(choices.map((choice) => choice.label)).toEqual(["Yes", "Yes, and don't ask again for edits this session", "No"]);
    expect(choices.map((choice) => choice.allow)).toEqual([true, true, false]);
    expect(choices[1]!.remember).toEqual({ mode: "acceptEdits" });
    expect(choices[1]!.hint).toBe("shift+tab");
    expect(choices[2]!.hint).toBe("esc");
  });

  it("pins 'don't ask again' for a command to that exact command, with a rule that matches it", () => {
    const args = { command: "npm test" };
    const remember = permissionChoices("run_command", "execute", args)[1]!;
    expect(remember.label).toContain("this exact command");
    expect(remember.remember).toEqual({ rule: "run_command(npm test)" });
    const rule = (remember.remember as { rule: string }).rule;
    expect(matchRule(rule, "run_command", args)).toBe(true);
    expect(matchRule(rule, "run_command", { command: "npm test && rm -rf ." })).toBe(false);
  });

  it("remembers the whole tool when there is no argument to pin it to", () => {
    const remember = permissionChoices("mcp_deploy", "execute", {})[1]!;
    expect(remember.label).toBe("Yes, and don't ask again for mcp_deploy this session");
    expect(remember.remember).toEqual({ rule: "mcp_deploy" });
  });

  it("offers no 'don't ask again' for a command a rule could not hold, or would widen", () => {
    for (const command of ["echo a\necho b", "rm -rf build/*", "ls *"]) {
      expect(permissionChoices("run_command", "execute", { command }).map((choice) => choice.label), command).toEqual(["Yes", "No"]);
    }
  });

  it("offers only yes and no when the tool's kind is not known or does not ask", () => {
    expect(permissionChoices("mystery", undefined, {}).map((choice) => choice.label)).toEqual(["Yes", "No"]);
    expect(permissionChoices("read_file", "read", { path: "a" }).map((choice) => choice.label)).toEqual(["Yes", "No"]);
  });

  it("tolerates arguments that are not an object", () => {
    expect(() => permissionChoices("run_command", "execute", undefined)).not.toThrow();
    expect(() => permissionChoices("run_command", "execute", "ls")).not.toThrow();
  });
});
