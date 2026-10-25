import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/system-prompt.js";

const build = (extra: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) => buildSystemPrompt({ workspaceRoot: "/repo", ...extra });

describe("buildSystemPrompt", () => {
  it("interpolates the workspace root", () => {
    expect(build()).toContain("/repo");
  });

  it("prefers edit_file over write_file for existing files, and doesn't mention apply_patch", () => {
    const rendered = build();
    expect(rendered).toContain("edit_file");
    expect(rendered).toContain("write_file");
    expect(rendered).not.toContain("apply_patch");
  });

  it(
    "tells the model to use the tool-calling mechanism rather than narrating a call as text " +
      "(regression: verified live against llama3.1:8b — offered real native tools, it still " +
      "sometimes described an intended call as markdown-fenced JSON inside its own answer " +
      "instead of actually invoking one)",
    () => {
      const rendered = build();
      expect(rendered).toMatch(/tool-calling mechanism/i);
      expect(rendered).toMatch(/never describe|narrate/i);
    },
  );

  it("instructs preservation of existing code over placeholder stubs", () => {
    expect(build()).toMatch(/your code here/i);
  });

  it("instructs against creating companion files", () => {
    expect(build()).toMatch(/companion file/i);
  });

  it("tells the model not to retry a denied or blocked call unchanged", () => {
    expect(build()).toMatch(/denied or blocked/i);
  });

  it("adds a plan-mode note only in plan mode", () => {
    expect(build({ mode: "plan" })).toMatch(/Plan mode/);
    expect(build({ mode: "default" })).not.toMatch(/Plan mode/);
    expect(build()).not.toMatch(/Plan mode/);
  });

  it("appends the skill index and the memory when given, and omits them otherwise", () => {
    const rendered = build({ skillIndex: "- review: Reviews diffs", memory: "# Project instructions\nuse tabs" });
    expect(rendered).toContain("- review: Reviews diffs");
    expect(rendered.endsWith("# Project instructions\nuse tabs")).toBe(true);
    expect(build()).not.toContain("skill tool");
  });
});
