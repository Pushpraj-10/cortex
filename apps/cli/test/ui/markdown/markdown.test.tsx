import React from "react";
import { describe, expect, it } from "vitest";
import { Markdown, spacingBefore } from "../../../src/ui/markdown/Markdown.js";
import { displayWidth } from "../../../src/format/table.js";
import { renderFrame } from "../support/render-frame.js";

const frame = async (content: string, width = 60) => (await renderFrame(<Markdown content={content} width={width} />, width)).split("\n");

describe("Markdown: text", () => {
  it("shows a heading directly above its text and a blank row between paragraphs", async () => {
    expect(await frame("# Title\nBody text.\n\nSecond paragraph.")).toEqual(["Title", "Body text.", "", "Second paragraph."]);
  });

  it("puts a blank row before a heading that follows a paragraph", async () => {
    expect(await frame("para\n\n## Head\ntext")).toEqual(["para", "", "Head", "text"]);
  });

  it("draws inline markup as styling, not as characters", async () => {
    expect(await frame("Use **bold**, *italic*, ~~old~~ and `code` here")).toEqual(["Use bold, italic, old and code here"]);
  });

  it("shows a link's URL after its text, but not twice", async () => {
    expect(await frame("[docs](https://x.dev/a)")).toEqual(["docs (https://x.dev/a)"]);
    expect(await frame("https://x.dev/a")).toEqual(["https://x.dev/a"]);
  });

  it("draws a quote with a bar", async () => {
    expect(await frame("> quoted words")).toEqual(["▎ quoted words"]);
  });

  it("draws a rule as wide as the content, up to a limit", async () => {
    expect(await frame("---", 10)).toEqual(["─".repeat(10)]);
    expect((await frame("---", 200))[0]).toHaveLength(80);
  });

  it("wraps a long paragraph inside the width", async () => {
    const lines = await frame("word ".repeat(30).trim(), 40);
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(40);
  });
});

describe("Markdown: lists", () => {
  it("draws bullets with a marker per depth and a hanging indent", async () => {
    expect(await frame("- one\n  - two\n    - three\n- four")).toEqual(["• one", "  ◦ two", "    ▪ three", "• four"]);
  });

  it("aligns ordered numbers of different widths", async () => {
    expect(await frame("9. nine\n10. ten")).toEqual(["9.  nine", "10. ten"]);
  });

  it("draws task items", async () => {
    expect(await frame("- [x] done\n- [ ] todo")).toEqual(["☑ done", "☐ todo"]);
  });

  it("keeps a list tight under a line that ends with a colon", async () => {
    expect(await frame("Steps:\n- a\n- b")).toEqual(["Steps:", "• a", "• b"]);
  });

  it("keeps wrapped item text under the item, not under the marker", async () => {
    const lines = await frame("- " + "word ".repeat(12).trim(), 24);
    expect(lines[0]!.startsWith("• ")).toBe(true);
    for (const line of lines.slice(1)) expect(line.startsWith("  ")).toBe(true);
  });
});

describe("Markdown: code and tables", () => {
  it("brackets a code block, with its language", async () => {
    expect(await frame("```ts\nconst a = 1;\n```")).toEqual(["╭─ ts", "│ const a = 1;", "╰─"]);
  });

  it("brackets a code block without a language, keeping blank lines", async () => {
    expect(await frame("```\na\n\nb\n```")).toEqual(["╭─", "│ a", "│", "│ b", "╰─"]);
  });

  it("draws a block that is still streaming in", async () => {
    expect(await frame("```js\nlet a")).toEqual(["╭─ js", "│ let a", "╰─"]);
  });

  it("draws a boxed table", async () => {
    expect(await frame("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual([
      "┌───┬───┐",
      "│ A │ B │",
      "├───┼───┤",
      "│ 1 │ 2 │",
      "└───┴───┘",
    ]);
  });

  it("fits a wide table into a narrow terminal", async () => {
    const lines = await frame("| Path | Description |\n|---|---|\n| a | this description is far too long for one line |", 30);
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(30);
    expect(lines.join("\n")).toContain("description");
  });
});

describe("spacingBefore", () => {
  it("is 0 for the first block and after a heading, 1 otherwise", () => {
    expect(spacingBefore(undefined, { type: "paragraph", text: "a" })).toBe(0);
    expect(spacingBefore({ type: "heading", level: 2, text: "h" }, { type: "paragraph", text: "a" })).toBe(0);
    expect(spacingBefore({ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" })).toBe(1);
    expect(spacingBefore({ type: "paragraph", text: "a" }, { type: "heading", level: 2, text: "h" })).toBe(1);
  });

  it("is 0 for a list right after a paragraph ending in a colon", () => {
    expect(spacingBefore({ type: "paragraph", text: "Steps:" }, { type: "list", items: [] })).toBe(0);
    expect(spacingBefore({ type: "paragraph", text: "Steps" }, { type: "list", items: [] })).toBe(1);
  });
});
