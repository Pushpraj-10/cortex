/**
 * Markdown parsing for the transcript: splits source into code blocks, headings, tables, bullet
 * lists and paragraphs. Pure — the Markdown component only renders what this returns.
 */

export type Block =
  | { type: "code"; language: string; content: string }
  | { type: "bullets"; items: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "table"; rows: string[][] }
  | { type: "paragraph"; text: string };

const FENCE_PATTERN = /```(\w*)\n([\s\S]*?)```/g;
const BULLET_PATTERN = /^[-*]\s+/;
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const TABLE_ROW_PATTERN = /^\|(.+)\|$/;
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/** Splits a `| a | b |` row into trimmed cells, dropping the leading/trailing pipes. */
function splitTableRow(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

/** Splits markdown source into fenced code blocks and the text blocks between them. */
export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(FENCE_PATTERN)) {
    const [full, language, code] = match;
    const before = source.slice(lastIndex, match.index);
    if (before.trim()) blocks.push(...parseTextBlocks(before));
    blocks.push({ type: "code", language: language ?? "", content: code?.replace(/\n$/, "") ?? "" });
    lastIndex = (match.index ?? 0) + full.length;
  }

  const rest = source.slice(lastIndex);
  if (rest.trim()) blocks.push(...parseTextBlocks(rest));

  return blocks;
}

/**
 * Splits non-code text into heading, table, bullet-list, and paragraph blocks. Each
 * blank-line group is further split into runs of consecutive lines of the same kind, so
 * a heading or table immediately followed by prose (no blank line between them) still
 * renders as its own block instead of being flattened into one paragraph just because
 * the group wasn't entirely one thing. Headings and table rows must be pulled out
 * before the generic paragraph fallback — otherwise `paragraphLines.join(" ")` splices
 * a `### heading` or `| a | b |` row into the middle of a prose sentence.
 */
function parseTextBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const groups = text.split(/\n{2,}/);

  for (const group of groups) {
    const lines = group.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      const headingMatch = HEADING_PATTERN.exec(line);
      if (BULLET_PATTERN.test(line)) {
        const items: string[] = [];
        while (i < lines.length && BULLET_PATTERN.test(lines[i]!)) {
          items.push(lines[i]!.replace(BULLET_PATTERN, ""));
          i += 1;
        }
        blocks.push({ type: "bullets", items });
      } else if (headingMatch) {
        blocks.push({ type: "heading", level: headingMatch[1]!.length, text: headingMatch[2]! });
        i += 1;
      } else if (TABLE_ROW_PATTERN.test(line)) {
        const rows: string[][] = [];
        while (i < lines.length && TABLE_ROW_PATTERN.test(lines[i]!)) {
          if (!TABLE_SEPARATOR_PATTERN.test(lines[i]!)) rows.push(splitTableRow(lines[i]!));
          i += 1;
        }
        if (rows.length > 0) blocks.push({ type: "table", rows });
      } else {
        const paragraphLines: string[] = [];
        while (
          i < lines.length &&
          !BULLET_PATTERN.test(lines[i]!) &&
          !HEADING_PATTERN.test(lines[i]!) &&
          !TABLE_ROW_PATTERN.test(lines[i]!)
        ) {
          paragraphLines.push(lines[i]!);
          i += 1;
        }
        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
      }
    }
  }

  return blocks;
}
