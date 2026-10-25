import { describe, expect, it } from "vitest";
import { decidePermission } from "../../src/permissions/decide-permission";

const read = { name: "Read", readOnly: true };
const bash = { name: "Bash", readOnly: false };
const edit = { name: "Edit", readOnly: false };
const none = { allow: [], deny: [] };

describe("decidePermission", () => {
  it("allows read-only tools and asks for others in default mode", () => {
    expect(decidePermission(read, {}, "default", none)).toBe("allow");
    expect(decidePermission(bash, { command: "ls" }, "default", none)).toBe("ask");
  });

  it("deny rules beat everything, including bypassPermissions", () => {
    const rules = { allow: ["Bash"], deny: ["Bash(rm:*)"] };
    expect(decidePermission(bash, { command: "rm -rf x" }, "bypassPermissions", rules)).toBe("deny");
    expect(decidePermission(bash, { command: "ls" }, "default", rules)).toBe("allow");
  });

  it("plan mode only allows read-only tools, even with allow rules", () => {
    expect(decidePermission(read, {}, "plan", none)).toBe("allow");
    expect(decidePermission(edit, {}, "plan", { allow: ["Edit"], deny: [] })).toBe("deny");
  });

  it("acceptEdits auto-allows edits but not Bash", () => {
    expect(decidePermission(edit, {}, "acceptEdits", none)).toBe("allow");
    expect(decidePermission(bash, { command: "ls" }, "acceptEdits", none)).toBe("ask");
  });
});
