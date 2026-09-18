import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

interface MarkdownProps {
  content: string;
}

type Block =
  | { type: "code"; language: string; content: string }
  | { type: "bullets"; items: string[] }
  | { type: "paragraph"; text: string };

const FENCE_PATTERN = /```(\w*)\n([\s\S]*?)```/g;
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;
const BULLET_PATTERN = /^[-*]\s+/;

/** Splits markdown source into code blocks, bullet lists, and paragraphs. */
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
 * Splits non-code text into bullet-list and paragraph blocks. Each blank-line group is
 * further split into runs of consecutive bullet lines vs. consecutive plain lines, so a
 * heading line immediately followed by a list (no blank line between them, e.g.
 * "Key points:\n- one\n- two") still renders the list as a list instead of falling back
 * to one flattened paragraph just because the group wasn't *entirely* bullets.
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
      if (BULLET_PATTERN.test(line)) {
        const items: string[] = [];
        while (i < lines.length && BULLET_PATTERN.test(lines[i]!)) {
          items.push(lines[i]!.replace(BULLET_PATTERN, ""));
          i += 1;
        }
        blocks.push({ type: "bullets", items });
      } else {
        const paragraphLines: string[] = [];
        while (i < lines.length && !BULLET_PATTERN.test(lines[i]!)) {
          paragraphLines.push(lines[i]!);
          i += 1;
        }
        blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
      }
    }
  }

  return blocks;
}

/** Renders **bold** and `code span` runs inside a single line of text. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={key} bold>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={key} color={colors.accent}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={key}>{part}</Text>;
  });
}

export function Markdown({ content }: MarkdownProps) {
  const blocks = parseBlocks(content);

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => {
        const key = `block-${i}`;
        if (block.type === "code") {
          return (
            <Box key={key} flexDirection="column" borderStyle="round" borderColor={colors.muted} paddingX={1}>
              {block.content.split("\n").map((line, lineIndex) => (
                <Text key={`${key}-line-${lineIndex}`}>{line}</Text>
              ))}
            </Box>
          );
        }

        if (block.type === "bullets") {
          return (
            <Box key={key} flexDirection="column">
              {block.items.map((item, itemIndex) => (
                <Text key={`${key}-item-${itemIndex}`}>
                  {"  • "}
                  {renderInline(item, `${key}-item-${itemIndex}`)}
                </Text>
              ))}
            </Box>
          );
        }

        return (
          <Text key={key} wrap="wrap">
            {renderInline(block.text, key)}
          </Text>
        );
      })}
    </Box>
  );
}
