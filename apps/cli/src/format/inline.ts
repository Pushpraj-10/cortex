/**
 * Inline markdown (`**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[text](url)` and bare URLs)
 * turned into styled runs of text: plain data, so the React side only maps runs to <Text> and this
 * can be tested without a terminal.
 *
 * It is forgiving on purpose, because it also runs on text that is still streaming in: an opener
 * with no closer yet is just literal text until the closer arrives. Underscores and single stars
 * only open emphasis at a word boundary, so `snake_case_names` and `2*3*4` stay as typed.
 */

export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  /** Set on link text. The renderer shows the URL after it unless the text already is the URL. */
  link?: string;
}

type Style = Omit<Span, "text">;

const ESCAPABLE = "\\`*_{}[]()#+-.!~|>";

export function parseInline(text: string): Span[] {
  return merge(parse(text, {}));
}

/** The text with all markup removed, e.g. for measuring or for table cells. */
export function plainText(text: string): string {
  return parseInline(text)
    .map((span) => span.text)
    .join("");
}

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);
const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

function parse(text: string, style: Style): Span[] {
  const spans: Span[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) spans.push({ ...style, text: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i]!;

    if (char === "\\" && i + 1 < text.length && ESCAPABLE.includes(text[i + 1]!)) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === "`") {
      let run = 1;
      while (text[i + run] === "`") run += 1;
      const close = findBacktickRun(text, i + run, run);
      if (close === -1) {
        buffer += "`".repeat(run);
        i += run;
        continue;
      }
      flush();
      let code = text.slice(i + run, close);
      if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
      spans.push({ ...style, text: code, code: true });
      i = close + run;
      continue;
    }

    if (char === "[") {
      const link = matchLink(text, i);
      if (link) {
        if (buffer.endsWith("!")) buffer = buffer.slice(0, -1); // an image: show its alt text as a link
        flush();
        spans.push({ ...style, text: plainText(link.label), link: link.url });
        i = link.end;
        continue;
      }
    }

    if (char === "h" && !isWordChar(text[i - 1])) {
      const url = matchBareUrl(text, i);
      if (url) {
        flush();
        spans.push({ ...style, text: url, link: url });
        i += url.length;
        continue;
      }
    }

    const emphasis = matchEmphasis(text, i);
    if (emphasis) {
      flush();
      spans.push(...parse(text.slice(i + emphasis.delimiter.length, emphasis.closeAt), { ...style, [emphasis.key]: true }));
      i = emphasis.closeAt + emphasis.delimiter.length;
      continue;
    }

    buffer += char;
    i += 1;
  }

  flush();
  return spans;
}

/** Index of a run of exactly `length` backticks at or after `from`, or -1. */
function findBacktickRun(text: string, from: number, length: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] !== "`") {
      i += 1;
      continue;
    }
    let run = 0;
    while (text[i + run] === "`") run += 1;
    if (run === length) return i;
    i += run;
  }
  return -1;
}

/** `[label](url)`, allowing one level of brackets in the label and parentheses in the URL. A title after the URL is dropped. */
function matchLink(text: string, start: number): { label: string; url: string; end: number } | undefined {
  let depth = 0;
  let i = start;
  for (; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\\") i += 1;
    else if (char === "[") depth += 1;
    else if (char === "]" && (depth -= 1) === 0) break;
    else if (char === "\n") return undefined;
  }
  if (i >= text.length || text[i + 1] !== "(") return undefined;

  const label = text.slice(start + 1, i);
  let parens = 1;
  let j = i + 2;
  for (; j < text.length && parens > 0; j += 1) {
    if (text[j] === "(") parens += 1;
    else if (text[j] === ")") parens -= 1;
    else if (text[j] === "\n") return undefined;
  }
  if (parens !== 0) return undefined;

  const url = text.slice(i + 2, j - 1).trim().split(/\s+/)[0] ?? "";
  if (label === "" || url === "") return undefined;
  return { label, url, end: j };
}

/** A bare http(s) URL, without trailing sentence punctuation or an unbalanced closing parenthesis. */
function matchBareUrl(text: string, start: number): string | undefined {
  const match = /^https?:\/\/[^\s<>]+/.exec(text.slice(start));
  if (!match) return undefined;
  let url = match[0];
  for (;;) {
    const last = url[url.length - 1]!;
    const unbalancedParen = last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0);
    if (/[.,;:!?'"\]]/.test(last) || unbalancedParen) url = url.slice(0, -1);
    else break;
  }
  return /^https?:\/\/.+/.test(url) ? url : undefined;
}

type EmphasisKey = "bold" | "italic" | "strike";

/**
 * An emphasis run starting at `start`: `**` / `__` bold, `~~` strike, `*` / `_` italic. The opener must be followed by
 * non-space and the closer preceded by non-space; single delimiters also need a word boundary before the opener (and,
 * for `_`, after the closer).
 */
function matchEmphasis(text: string, start: number): { key: EmphasisKey; delimiter: string; closeAt: number } | undefined {
  const char = text[start]!;
  if (char !== "*" && char !== "_" && char !== "~") return undefined;

  const double = text[start + 1] === char;
  let delimiter: string;
  let key: EmphasisKey;
  if (char === "~") {
    if (!double) return undefined;
    delimiter = "~~";
    key = "strike";
  } else if (double) {
    delimiter = char + char;
    key = "bold";
  } else {
    delimiter = char;
    key = "italic";
    if (isWordChar(text[start - 1])) return undefined;
  }

  const contentStart = start + delimiter.length;
  if (isSpace(text[contentStart]) || (delimiter.length === 1 && text[contentStart] === char)) return undefined;

  for (let j = contentStart + 1; j < text.length; j += 1) {
    if (!text.startsWith(delimiter, j)) continue;
    if (isSpace(text[j - 1])) continue;
    if (text[j + delimiter.length] === char) continue; // part of a longer run; the last delimiter of the run closes
    if (char === "_" && isWordChar(text[j + delimiter.length])) continue;
    if (delimiter.length === 1 && text[j - 1] === char) continue;
    return { key, delimiter, closeAt: j };
  }
  return undefined;
}

/** Joins neighbouring runs that carry exactly the same style. */
function merge(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && sameStyle(previous, span)) previous.text += span.text;
    else merged.push({ ...span });
  }
  return merged;
}

function sameStyle(a: Span, b: Span): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.code === b.code && a.link === b.link;
}
