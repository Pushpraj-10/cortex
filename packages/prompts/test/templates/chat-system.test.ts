import { describe, expect, it } from "vitest";
import { chatSystemTemplate } from "../../src/templates/chat-system.js";

describe("chatSystemTemplate", () => {
  it("has the expected id", () => {
    expect(chatSystemTemplate.id).toBe("chat-system");
  });

  it("interpolates the workspace root", () => {
    expect(chatSystemTemplate.render({ workspaceRoot: "/repo" })).toContain("/repo");
  });

  it("prefers edit_file over write_file for existing files, and doesn't mention apply_patch", () => {
    const rendered = chatSystemTemplate.render({ workspaceRoot: "/repo" });
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
      const rendered = chatSystemTemplate.render({ workspaceRoot: "/repo" });
      expect(rendered).toMatch(/tool-calling mechanism/i);
      expect(rendered).toMatch(/never describe|narrate/i);
    },
  );

  it("instructs preservation of existing code over placeholder stubs", () => {
    const rendered = chatSystemTemplate.render({ workspaceRoot: "/repo" });
    expect(rendered).toMatch(/your code here/i);
  });

  it("instructs against creating companion files", () => {
    const rendered = chatSystemTemplate.render({ workspaceRoot: "/repo" });
    expect(rendered).toMatch(/companion file/i);
  });
});
