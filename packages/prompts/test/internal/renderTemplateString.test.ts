import { describe, expect, it } from "vitest";
import { MissingTemplateVariableError, renderTemplateString } from "../../src/internal/renderTemplateString.js";

describe("renderTemplateString", () => {
  it("substitutes a single placeholder", () => {
    expect(renderTemplateString("Hello {{name}}!", { name: "World" })).toBe("Hello World!");
  });

  it("substitutes multiple placeholders, including repeats", () => {
    expect(renderTemplateString("{{a}} + {{a}} = {{b}}", { a: "1", b: "2" })).toBe("1 + 1 = 2");
  });

  it("leaves text with no placeholders unchanged", () => {
    expect(renderTemplateString("no placeholders here", {})).toBe("no placeholders here");
  });

  it("throws when a placeholder has no matching variable", () => {
    expect(() => renderTemplateString("Hello {{name}}", {})).toThrow(MissingTemplateVariableError);
  });
});
