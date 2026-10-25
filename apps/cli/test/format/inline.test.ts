import { describe, expect, it } from "vitest";
import { parseInline, plainText } from "../../src/format/inline.js";

describe("parseInline: styles", () => {
  it("leaves plain text as one run", () => {
    expect(parseInline("just words")).toEqual([{ text: "just words" }]);
    expect(parseInline("")).toEqual([]);
  });

  it("styles bold with ** and __", () => {
    expect(parseInline("a **b** c")).toEqual([{ text: "a " }, { text: "b", bold: true }, { text: " c" }]);
    expect(parseInline("__b__")).toEqual([{ text: "b", bold: true }]);
  });

  it("styles italic with * and _ at a word boundary", () => {
    expect(parseInline("a *b* c")).toEqual([{ text: "a " }, { text: "b", italic: true }, { text: " c" }]);
    expect(parseInline("a _b_ c")).toEqual([{ text: "a " }, { text: "b", italic: true }, { text: " c" }]);
  });

  it("combines bold and italic for ***text***", () => {
    expect(parseInline("***both***")).toEqual([{ text: "both", bold: true, italic: true }]);
  });

  it("styles strikethrough", () => {
    expect(parseInline("~~gone~~")).toEqual([{ text: "gone", strike: true }]);
  });

  it("nests styles", () => {
    expect(parseInline("**bold and *italic* inside**")).toEqual([
      { text: "bold and ", bold: true },
      { text: "italic", bold: true, italic: true },
      { text: " inside", bold: true },
    ]);
  });

  it("styles code spans and leaves their content raw", () => {
    expect(parseInline("run `npm test` now")).toEqual([{ text: "run " }, { text: "npm test", code: true }, { text: " now" }]);
    expect(parseInline("`**not bold**`")).toEqual([{ text: "**not bold**", code: true }]);
  });

  it("supports double backticks around a code span holding a backtick", () => {
    expect(parseInline("``a`b``")).toEqual([{ text: "a`b", code: true }]);
  });

  it("keeps code inside bold", () => {
    expect(parseInline("**use `x` here**")).toEqual([
      { text: "use ", bold: true },
      { text: "x", bold: true, code: true },
      { text: " here", bold: true },
    ]);
  });
});

describe("parseInline: things that must stay literal", () => {
  it("does not treat snake_case_names or 2*3*4 as emphasis", () => {
    expect(parseInline("snake_case_name")).toEqual([{ text: "snake_case_name" }]);
    expect(parseInline("2*3*4")).toEqual([{ text: "2*3*4" }]);
  });

  it("does not treat spaced stars as emphasis", () => {
    expect(parseInline("a * b * c")).toEqual([{ text: "a * b * c" }]);
    expect(parseInline("a ** b ** c")).toEqual([{ text: "a ** b ** c" }]);
  });

  it("shows an opener with no closer yet as text (streaming)", () => {
    expect(parseInline("**not closed yet")).toEqual([{ text: "**not closed yet" }]);
    expect(parseInline("a `half")).toEqual([{ text: "a `half" }]);
    // The half-typed URL is picked up as a bare URL, so check that no characters are lost or changed.
    expect(plainText("see [label](http://half")).toBe("see [label](http://half");
  });

  it("honours backslash escapes", () => {
    expect(parseInline("\\*not italic\\*")).toEqual([{ text: "*not italic*" }]);
    expect(parseInline("a\\\\b")).toEqual([{ text: "a\\b" }]);
  });
});

describe("parseInline: links", () => {
  it("parses [text](url)", () => {
    expect(parseInline("see [Docs](https://x.dev/a) now")).toEqual([
      { text: "see " },
      { text: "Docs", link: "https://x.dev/a" },
      { text: " now" },
    ]);
  });

  it("drops a link title, and keeps parentheses inside the URL", () => {
    expect(parseInline('[a](https://x.dev "A title")')).toEqual([{ text: "a", link: "https://x.dev" }]);
    expect(parseInline("[w](https://en.wikipedia.org/wiki/A_(b))")).toEqual([{ text: "w", link: "https://en.wikipedia.org/wiki/A_(b)" }]);
  });

  it("strips markup from the link text", () => {
    expect(parseInline("[**bold** link](u)")).toEqual([{ text: "bold link", link: "u" }]);
  });

  it("is not a link without the parenthesised URL", () => {
    expect(parseInline("[x] (y)")).toEqual([{ text: "[x] (y)" }]);
  });

  it("shows an image's alt text as a link", () => {
    expect(parseInline("![alt](pic.png)")).toEqual([{ text: "alt", link: "pic.png" }]);
  });

  it("links bare URLs without their trailing punctuation", () => {
    expect(parseInline("see https://a.dev/x.")).toEqual([{ text: "see " }, { text: "https://a.dev/x", link: "https://a.dev/x" }, { text: "." }]);
    expect(parseInline("(https://a.dev)")).toEqual([{ text: "(" }, { text: "https://a.dev", link: "https://a.dev" }, { text: ")" }]);
  });

  it("does not link a URL glued to a word", () => {
    expect(parseInline("xhttps://a.dev")).toEqual([{ text: "xhttps://a.dev" }]);
  });
});

describe("plainText", () => {
  it("removes all markup", () => {
    expect(plainText("**a** `b` [c](d) ~~e~~ _f_")).toBe("a b c e f");
  });
});
