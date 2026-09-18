import { describe, expect, it } from "vitest";
import {
  UnknownTemplateError,
  getTemplate,
  listTemplates,
  registerTemplate,
  renderPrompt,
} from "../../src/core/template-registry.js";
import { createStringTemplate } from "../../src/core/string-template.js";

describe("template registry", () => {
  it("registers and retrieves a template by id", () => {
    const template = createStringTemplate("registry-test-a", "Hello {{name}}!");
    registerTemplate(template);
    expect(getTemplate("registry-test-a")).toBe(template);
  });

  it("renders a registered template through renderPrompt", () => {
    registerTemplate(createStringTemplate("registry-test-b", "Hi {{name}}"));
    expect(renderPrompt("registry-test-b", { name: "Cortex" })).toBe("Hi Cortex");
  });

  it("throws UnknownTemplateError for an unregistered id", () => {
    expect(() => getTemplate("registry-test-nonexistent")).toThrow(UnknownTemplateError);
  });

  it("lists all registered templates", () => {
    registerTemplate(createStringTemplate("registry-test-c", "c"));
    expect(listTemplates().map((t) => t.id)).toContain("registry-test-c");
  });
});
