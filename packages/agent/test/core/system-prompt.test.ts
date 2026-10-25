import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../src/core/system-prompt.js";

describe("buildSystemPrompt", () => {
  it("interpolates the workspace root", () => {
    expect(buildSystemPrompt("/repo")).toContain("/repo");
  });

  it("prefers edit_file over write_file for existing files, and doesn't mention apply_patch", () => {
    const rendered = buildSystemPrompt("/repo");
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
      const rendered = buildSystemPrompt("/repo");
      expect(rendered).toMatch(/tool-calling mechanism/i);
      expect(rendered).toMatch(/never describe|narrate/i);
    },
  );

  it("instructs preservation of existing code over placeholder stubs", () => {
    expect(buildSystemPrompt("/repo")).toMatch(/your code here/i);
  });

  it("instructs against creating companion files", () => {
    expect(buildSystemPrompt("/repo")).toMatch(/companion file/i);
  });
});
