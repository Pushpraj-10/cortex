/**
 * Syntax highlighting for code blocks (and, later, diffs): code in, lines of coloured runs out. The runs
 * name a *scope* (keyword, string, ...), not a colour, so the theme decides how each looks and this stays
 * pure. highlight.js does the tokenising through `lowlight`; there is no language guessing, because a
 * guess on a short snippet or on plain command output paints it with confident but wrong colours.
 */
import { common, createLowlight } from "lowlight";

export type SyntaxScope = "keyword" | "string" | "number" | "comment" | "title" | "type" | "builtin";

export interface Run {
  text: string;
  scope?: SyntaxScope;
}

const lowlight = createLowlight(common);

/** Past this, highlighting costs more than it is worth on every streamed update; show plain text. */
const MAX_CHARACTERS = 20_000;
const MAX_LINES = 600;

/** highlight.js class (without the `hljs-` prefix) to scope. Anything not listed is left uncoloured. */
const SCOPES: Record<string, SyntaxScope> = {
  keyword: "keyword",
  "selector-tag": "keyword",
  "template-tag": "keyword",
  name: "keyword",
  literal: "number",
  number: "number",
  symbol: "number",
  string: "string",
  regexp: "string",
  addition: "string",
  built_in: "builtin",
  meta: "builtin",
  "template-variable": "builtin",
  type: "type",
  class: "type",
  attr: "type",
  attribute: "type",
  title: "title",
  section: "title",
  comment: "comment",
  doctag: "comment",
  quote: "comment",
};

interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

function scopeOf(node: HastNode): SyntaxScope | undefined {
  const classes = Array.isArray(node.properties?.className) ? (node.properties!.className as string[]) : [];
  if (classes.includes("class_")) return "type"; // `title class_`: the name of a class
  if (classes.includes("function_")) return "title";
  for (const name of classes) {
    const scope = SCOPES[name.replace(/^hljs-/, "")];
    if (scope) return scope;
  }
  return undefined;
}

/** Walks the tree, passing the nearest enclosing scope down, and splits the text into lines. */
function toLines(root: HastNode): Run[][] {
  const lines: Run[][] = [[]];
  const walk = (node: HastNode, inherited: SyntaxScope | undefined) => {
    if (node.type === "text") {
      const pieces = (node.value ?? "").split("\n");
      pieces.forEach((piece, index) => {
        if (index > 0) lines.push([]);
        if (piece !== "") lines[lines.length - 1]!.push(inherited ? { text: piece, scope: inherited } : { text: piece });
      });
      return;
    }
    const scope = (node.type === "element" ? scopeOf(node) : undefined) ?? inherited;
    for (const child of node.children ?? []) walk(child, scope);
  };
  walk(root, undefined);
  return lines;
}

function plainLines(code: string): Run[][] {
  return code.split("\n").map((line) => (line === "" ? [] : [{ text: line }]));
}

/**
 * `code` as lines of runs. An unknown or missing `language`, oversized input, or any highlighter error gives
 * plain lines, never an exception. The text of the lines always joins back to `code`.
 */
export function highlightLines(code: string, language: string): Run[][] {
  const name = language.trim().toLowerCase();
  if (name === "" || !lowlight.registered(name) || code.length > MAX_CHARACTERS || code.split("\n").length > MAX_LINES) {
    return plainLines(code);
  }
  try {
    return toLines(lowlight.highlight(name, code) as unknown as HastNode);
  } catch {
    return plainLines(code);
  }
}
