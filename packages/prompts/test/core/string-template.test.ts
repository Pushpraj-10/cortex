import { describe, expect, it } from "vitest";
import { createStringTemplate } from "../../src/core/string-template.js";

describe("createStringTemplate", () => {
  it("renders the given template string with vars substituted", () => {
    const template = createStringTemplate("greeting", "Hello {{name}}!");
    expect(template.id).toBe("greeting");
    expect(template.render({ name: "World" })).toBe("Hello World!");
  });
});
