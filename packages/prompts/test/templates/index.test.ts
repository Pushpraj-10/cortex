import { describe, expect, it } from "vitest";
import { registerTemplate, renderPrompt } from "../../src/index.js";
import { defaultTemplates } from "../../src/templates/index.js";

describe("defaultTemplates", () => {
  it("includes exactly the three built-in templates", () => {
    expect(defaultTemplates.map((template) => template.id).sort()).toEqual([
      "chat-system",
      "remediation-plan",
      "review-analysis",
    ]);
  });

  it("can be registered and rendered through the generic registry", () => {
    for (const template of defaultTemplates) registerTemplate(template);
    expect(renderPrompt("chat-system", { workspaceRoot: "/repo" })).toContain("/repo");
  });
});
