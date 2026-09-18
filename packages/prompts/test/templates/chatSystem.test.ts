import { describe, expect, it } from "vitest";
import { chatSystemTemplate } from "../../src/templates/chatSystem.js";

describe("chatSystemTemplate", () => {
  it("has the expected id", () => {
    expect(chatSystemTemplate.id).toBe("chat-system");
  });

  it("interpolates the workspace root", () => {
    expect(chatSystemTemplate.render({ workspaceRoot: "/repo" })).toContain("/repo");
  });

  it("prefers apply_patch/edit_file over rewriting whole files", () => {
    const rendered = chatSystemTemplate.render({ workspaceRoot: "/repo" });
    expect(rendered).toContain("apply_patch");
    expect(rendered).toContain("edit_file");
  });

  it(
    "tells the model to use the tool-calling mechanism rather than narrating a call as text " +
      "(regression: verified live against llama3.1:8b — offered real native tools, it still " +
      "sometimes described an intended call as markdown-fenced JSON inside its own answer " +
      "instead of actually invoking one, once this instruction was dropped along with the " +
      "old JSON-in-text protocol's own version of it)",
    () => {
      const rendered = chatSystemTemplate.render({ workspaceRoot: "/repo" });
      expect(rendered).toMatch(/tool-calling mechanism/i);
      expect(rendered).toMatch(/never describe|narrate/i);
    },
  );
});
