import { describe, expect, it } from "vitest";
import { highlightLines, languageOf, type Run } from "../../src/format/highlight.js";

const text = (lines: Run[][]) => lines.map((runs) => runs.map((run) => run.text).join("")).join("\n");
const scopesOf = (lines: Run[][]) => new Set(lines.flat().flatMap((run) => (run.scope ? [run.scope] : [])));
const find = (lines: Run[][], word: string) => lines.flat().find((run) => run.text === word);

describe("highlightLines", () => {
  it("gives plain lines for an unknown or missing language", () => {
    expect(highlightLines("a\n\nb", "")).toEqual([[{ text: "a" }], [], [{ text: "b" }]]);
    expect(highlightLines("x", "klingon")).toEqual([[{ text: "x" }]]);
  });

  it("scopes keywords, numbers, strings and comments in TypeScript", () => {
    const lines = highlightLines('const answer = 42; // note\nlet s = "hi";', "ts");
    expect(find(lines, "const")?.scope).toBe("keyword");
    expect(find(lines, "42")?.scope).toBe("number");
    expect(find(lines, "// note")?.scope).toBe("comment");
    expect(find(lines, '"hi"')?.scope).toBe("string");
  });

  it("always joins back to the original code", () => {
    const code = 'function f(a, b) {\n  /* multi\n  line */\n  return a + b; // sum\n}\n';
    expect(text(highlightLines(code, "javascript"))).toBe(code);
  });

  it("keeps the scope on each line of a multi-line comment", () => {
    const lines = highlightLines("/* a\nb */", "js");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual([{ text: "/* a", scope: "comment" }]);
    expect(lines[1]).toEqual([{ text: "b */", scope: "comment" }]);
  });

  it("is case-insensitive about the language and understands aliases", () => {
    expect(scopesOf(highlightLines("const a = 1", "TS")).has("keyword")).toBe(true);
    expect(scopesOf(highlightLines('echo "hi"', "sh")).has("string")).toBe(true);
  });

  it("scopes JSON values", () => {
    const lines = highlightLines('{"a": 1, "b": "x"}', "json");
    expect(find(lines, "1")?.scope).toBe("number");
    expect(scopesOf(lines).has("string")).toBe(true);
  });

  it("colours the name of a class and of a function", () => {
    const lines = highlightLines("class Foo {}\nfunction bar() {}", "js");
    expect(find(lines, "Foo")?.scope).toBe("type");
    expect(find(lines, "bar")?.scope).toBe("title");
  });

  it("falls back to plain lines for oversized input", () => {
    const big = "const a = 1;\n".repeat(700);
    const lines = highlightLines(big, "ts");
    expect(scopesOf(lines).size).toBe(0);
    expect(text(lines)).toBe(big.replace(/\n$/, "\n"));
  });
});

describe("languageOf", () => {
  it("maps common extensions to a highlighter language", () => {
    expect(languageOf("src/app.ts")).toBe("typescript");
    expect(languageOf("src/App.tsx")).toBe("typescript");
    expect(languageOf("a/b/c.mjs")).toBe("javascript");
    expect(languageOf("data.json")).toBe("json");
    expect(languageOf("README.md")).toBe("markdown");
    expect(languageOf("run.sh")).toBe("bash");
    expect(languageOf("index.html")).toBe("xml");
    expect(languageOf("main.py")).toBe("python");
  });

  it("is case-insensitive and handles Windows paths", () => {
    expect(languageOf("SRC\\APP.TS")).toBe("typescript");
    expect(languageOf("C:\\proj\\src\\main.py")).toBe("python");
  });

  it("knows a Makefile by name and is empty for unknown or missing extensions", () => {
    expect(languageOf("Makefile")).toBe("makefile");
    expect(languageOf("notes.xyz")).toBe("");
    expect(languageOf("LICENSE")).toBe("");
    expect(languageOf("")).toBe("");
  });

  it.each([
    ["a.ts", "const a = 1;"],
    ["a.js", "const a = 1;"],
    ["a.py", "def f():\n    return 1"],
    ["a.go", "func main() {}"],
    ["a.rs", "fn main() {}"],
    ["a.java", "public class A {}"],
    ["a.sh", 'echo "x"'],
    ["a.sql", "SELECT 1 FROM t"],
    ["a.css", "a { color: red; }"],
    ["a.json", '{"a": 1}'],
  ])("maps %s to a language the highlighter really has (it colours real code)", (file, code) => {
    // A name the highlighter does not know would silently give plain text, with no scopes at all.
    expect(scopesOf(highlightLines(code, languageOf(file))).size).toBeGreaterThan(0);
  });
});
