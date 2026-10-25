import { describe, expect, it } from "vitest";
import { parseBlocks } from "../../src/format/markdown.js";

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
    const blocks = parseBlocks("| Path | Description |\n|------|-------------|\n| packages/providers | Chat layer |");
    expect(blocks).toEqual([
      { type: "table", rows: [["Path", "Description"], ["packages/providers", "Chat layer"]], align: ["left", "left"] },
    ]);
  });

  it("does not splice a table row into the middle of a flattened paragraph", () => {
    const blocks = parseBlocks("Workspace layout:\n| Path | Description |\n| packages/providers | Chat layer |\nDone.");
    expect(blocks).toEqual([
      { type: "paragraph", text: "Workspace layout:" },
      { type: "table", rows: [["Path", "Description"], ["packages/providers", "Chat layer"]], align: ["left", "left"] },
      { type: "paragraph", text: "Done." },
    ]);
  });

  it("still flattens consecutive plain lines with no blank line into one paragraph", () => {
    const blocks = parseBlocks("Line one\nLine two\nLine three");
    expect(blocks).toEqual([{ type: "paragraph", text: "Line one Line two Line three" }]);
  });
});

describe("parseBlocks: headings, rules and paragraphs", () => {
  it("reads heading levels 1 to 6 and drops closing hashes but not a trailing C#", () => {
    expect(parseBlocks("# One\n###### Six\n## Closed ##\n## Using C#")).toEqual([
      { type: "heading", level: 1, text: "One" },
      { type: "heading", level: 6, text: "Six" },
      { type: "heading", level: 2, text: "Closed" },
      { type: "heading", level: 2, text: "Using C#" },
    ]);
  });

  it("does not treat a # without a space as a heading", () => {
    expect(parseBlocks("#hashtag")).toEqual([{ type: "paragraph", text: "#hashtag" }]);
  });

  it("reads --- *** and ___ as rules, but not bold text", () => {
    expect(parseBlocks("---\n***\n___\n- - -")).toEqual([{ type: "rule" }, { type: "rule" }, { type: "rule" }, { type: "rule" }]);
    expect(parseBlocks("***bold***")).toEqual([{ type: "paragraph", text: "***bold***" }]);
  });

  it("keeps a hard break (two trailing spaces or a backslash) and joins soft breaks", () => {
    expect(parseBlocks("one  \ntwo\nthree\\\nfour")).toEqual([{ type: "paragraph", text: "one\ntwo three\nfour" }]);
  });

  it("splits paragraphs at blank lines and accepts CRLF", () => {
    expect(parseBlocks("a\r\n\r\nb")).toEqual([
      { type: "paragraph", text: "a" },
      { type: "paragraph", text: "b" },
    ]);
  });

  it("is empty for empty or blank input", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("\n  \n")).toEqual([]);
  });
});

describe("parseBlocks: lists", () => {
  it("reads bullets with -, * and + as one list", () => {
    expect(parseBlocks("- a\n* b\n+ c")).toEqual([
      {
        type: "list",
        items: [
          { depth: 0, text: "a" },
          { depth: 0, text: "b" },
          { depth: 0, text: "c" },
        ],
      },
    ]);
  });

  it("keeps a list directly after a paragraph as its own block", () => {
    expect(parseBlocks("Steps:\n- a\n- b")).toEqual([
      { type: "paragraph", text: "Steps:" },
      {
        type: "list",
        items: [
          { depth: 0, text: "a" },
          { depth: 0, text: "b" },
        ],
      },
    ]);
  });

  it("nests by indentation, whatever the indent width", () => {
    const [list] = parseBlocks("- a\n  - b\n    - c\n- d\n    - e");
    expect(list).toEqual({
      type: "list",
      items: [
        { depth: 0, text: "a" },
        { depth: 1, text: "b" },
        { depth: 2, text: "c" },
        { depth: 0, text: "d" },
        { depth: 1, text: "e" },
      ],
    });
  });

  it("keeps ordered numbers as written when they differ", () => {
    expect(parseBlocks("3. c\n4. d")).toEqual([
      {
        type: "list",
        items: [
          { depth: 0, number: 3, text: "c" },
          { depth: 0, number: 4, text: "d" },
        ],
      },
    ]);
  });

  it("counts up a list numbered 1. on every line, restarting under each parent", () => {
    const [list] = parseBlocks("1. a\n   1. x\n   1. y\n1. b\n   1. z");
    expect(list).toEqual({
      type: "list",
      items: [
        { depth: 0, number: 1, text: "a" },
        { depth: 1, number: 1, text: "x" },
        { depth: 1, number: 2, text: "y" },
        { depth: 0, number: 2, text: "b" },
        { depth: 1, number: 1, text: "z" },
      ],
    });
  });

  it("reads task items", () => {
    const [list] = parseBlocks("- [ ] todo\n- [x] done");
    expect(list).toEqual({
      type: "list",
      items: [
        { depth: 0, checked: false, text: "todo" },
        { depth: 0, checked: true, text: "done" },
      ],
    });
  });

  it("continues an item with indented text on the next line", () => {
    expect(parseBlocks("- first line\n  more of it\n- second")).toEqual([
      {
        type: "list",
        items: [
          { depth: 0, text: "first line more of it" },
          { depth: 0, text: "second" },
        ],
      },
    ]);
  });

  it("keeps one list across blank lines between items, and ends it at other text", () => {
    expect(parseBlocks("- a\n\n- b\n\nafter")).toEqual([
      {
        type: "list",
        items: [
          { depth: 0, text: "a" },
          { depth: 0, text: "b" },
        ],
      },
      { type: "paragraph", text: "after" },
    ]);
  });

  it("splits a list around an indented code block and keeps the numbers going", () => {
    const blocks = parseBlocks("1. install\n   ```bash\n   npm i\n   ```\n2. run");
    expect(blocks).toEqual([
      { type: "list", items: [{ depth: 0, number: 1, text: "install" }] },
      { type: "code", language: "bash", content: "npm i" },
      { type: "list", items: [{ depth: 0, number: 2, text: "run" }] },
    ]);
  });
});

describe("parseBlocks: quotes", () => {
  it("joins quoted lines into one paragraph and starts another at an empty > line", () => {
    expect(parseBlocks("> one\n> two\n>\n> three")).toEqual([{ type: "quote", text: "one two\nthree" }]);
  });

  it("ends a quote at plain text", () => {
    expect(parseBlocks("> quoted\nplain")).toEqual([
      { type: "quote", text: "quoted" },
      { type: "paragraph", text: "plain" },
    ]);
  });
});

describe("parseBlocks: code", () => {
  it("reads a fenced block with its language", () => {
    expect(parseBlocks("```ts\nconst a = 1;\n```")).toEqual([{ type: "code", language: "ts", content: "const a = 1;" }]);
  });

  it("reads ~~~ fences, ignores the rest of the info string, and keeps blank lines inside", () => {
    expect(parseBlocks("~~~python title=x\na\n\nb\n~~~")).toEqual([{ type: "code", language: "python", content: "a\n\nb" }]);
  });

  it("does not close a fence on a shorter or different fence", () => {
    expect(parseBlocks("````\n```\ninner\n```\n````")).toEqual([{ type: "code", language: "", content: "```\ninner\n```" }]);
    expect(parseBlocks("```\na\n~~~\nb\n```")).toEqual([{ type: "code", language: "", content: "a\n~~~\nb" }]);
  });

  it("treats an unterminated fence as a block that runs to the end (streaming)", () => {
    expect(parseBlocks("text\n```js\nlet a")).toEqual([
      { type: "paragraph", text: "text" },
      { type: "code", language: "js", content: "let a" },
    ]);
  });

  it("does not read markdown inside code", () => {
    expect(parseBlocks("```\n# not a heading\n- not a list\n```")).toEqual([
      { type: "code", language: "", content: "# not a heading\n- not a list" },
    ]);
  });

  it("removes the fence's own indentation from the lines", () => {
    expect(parseBlocks("  ```\n  a\n    b\n  ```")).toEqual([{ type: "code", language: "", content: "a\n  b" }]);
  });
});

describe("parseBlocks: tables", () => {
  it("reads alignment from the separator row", () => {
    const [table] = parseBlocks("| a | b | c | d |\n|---|:--|:-:|--:|\n| 1 | 2 | 3 | 4 |");
    expect(table).toEqual({
      type: "table",
      rows: [
        ["a", "b", "c", "d"],
        ["1", "2", "3", "4"],
      ],
      align: ["left", "left", "center", "right"],
    });
  });

  it("pads short rows so every row has the same number of cells", () => {
    const [table] = parseBlocks("| a | b |\n|---|---|\n| only |");
    expect(table).toMatchObject({ rows: [["a", "b"], ["only", ""]] });
  });

  it("keeps an escaped pipe inside its cell", () => {
    const [table] = parseBlocks("| a \\| b | c |\n|---|---|");
    expect(table).toMatchObject({ rows: [["a | b", "c"]] });
  });

  it("keeps a data row made only of single dashes, which is not a separator", () => {
    const [table] = parseBlocks("| a | b |\n|---|---|\n| - | - |");
    expect(table).toMatchObject({ rows: [["a", "b"], ["-", "-"]] });
  });

  it("ends a table at a blank line", () => {
    expect(parseBlocks("| a |\n|---|\n| 1 |\n\ntext")).toEqual([
      { type: "table", rows: [["a"], ["1"]], align: ["left"] },
      { type: "paragraph", text: "text" },
    ]);
  });
});
