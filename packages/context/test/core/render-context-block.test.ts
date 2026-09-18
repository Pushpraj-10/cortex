import { describe, expect, it } from "vitest";
import { renderContextBlock } from "../../src/core/render-context-block.js";

describe("renderContextBlock", () => {
  it("returns an empty string for no fragments", () => {
    expect(renderContextBlock([])).toBe("");
  });

  it("renders one fragment as a heading under the workspace-context header", () => {
    const result = renderContextBlock([{ providerId: "a", title: "Workspace Overview", content: "some content" }]);
    expect(result).toBe("# Workspace Context\n\n## Workspace Overview\nsome content");
  });

  it("renders multiple fragments as separate sections in order", () => {
    const result = renderContextBlock([
      { providerId: "a", title: "First", content: "one" },
      { providerId: "b", title: "Second", content: "two" },
    ]);
    expect(result).toBe("# Workspace Context\n\n## First\none\n\n## Second\ntwo");
  });
});
