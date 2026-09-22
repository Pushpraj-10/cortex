import { describe, expect, it } from "vitest";
import { parseBlocks } from "../../src/components/Markdown.js";

describe("parseBlocks", () => {
  it("keeps a heading separate from a following paragraph in the same blank-line group", () => {
    const blocks = parseBlocks("### packages/agent\nRuns the tool-use loop.");
    expect(blocks).toEqual([
      { type: "heading", level: 3, text: "packages/agent" },
      { type: "paragraph", text: "Runs the tool-use loop." },
    ]);
  });

  it("does not splice a heading into the middle of a flattened paragraph", () => {
    const blocks = parseBlocks("Each package is independent,\n### packages/context\nassembled per turn.");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Each package is independent," },
      { type: "heading", level: 3, text: "packages/context" },
      { type: "paragraph", text: "assembled per turn." },
    ]);
  });

  it("parses a pipe table into rows, dropping the dashed separator row", () => {
    const blocks = parseBlocks("| Path | Description |\n|------|-------------|\n| packages/llm | Chat layer |");
    expect(blocks).toEqual([
      { type: "table", rows: [["Path", "Description"], ["packages/llm", "Chat layer"]] },
    ]);
  });

  it("does not splice a table row into the middle of a flattened paragraph", () => {
    const blocks = parseBlocks("Workspace layout:\n| Path | Description |\n| packages/llm | Chat layer |\nDone.");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Workspace layout:" },
      { type: "table", rows: [["Path", "Description"], ["packages/llm", "Chat layer"]] },
      { type: "paragraph", text: "Done." },
    ]);
  });

  it("still flattens consecutive plain lines with no blank line into one paragraph", () => {
    const blocks = parseBlocks("Line one\nLine two\nLine three");
    expect(blocks).toEqual([{ type: "paragraph", text: "Line one Line two Line three" }]);
  });
});
