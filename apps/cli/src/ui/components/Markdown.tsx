/** Renders the blocks `parseBlocks` finds: code, bullets, headings, tables, and paragraphs with inline bold and code. */
import React from "react";
import { Box, Text } from "ink";
import { parseBlocks } from "../../format/markdown.js";
import type { Theme } from "../theme/themes.js";
import { useTheme } from "../theme/ThemeContext.js";

interface MarkdownProps {
  content: string;
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`)/g;

/** Renders **bold** and `code span` runs inside a single line of text. */
function renderInline(text: string, keyPrefix: string, theme: Theme): React.ReactNode[] {
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
        <Text key={key} color={theme.text.accent}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={key}>{part}</Text>;
  });
}

export function Markdown({ content }: MarkdownProps) {
  const theme = useTheme();
  const blocks = parseBlocks(content);

  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => {
        const key = `block-${i}`;
        if (block.type === "code") {
          return (
            <Box key={key} flexDirection="column" borderStyle="round" borderColor={theme.border.default} paddingX={1}>
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
                  {renderInline(item, `${key}-item-${itemIndex}`, theme)}
                </Text>
              ))}
            </Box>
          );
        }

        if (block.type === "heading") {
          return (
            <Text key={key} bold color={theme.text.accent}>
              {renderInline(block.text, key, theme)}
            </Text>
          );
        }

        if (block.type === "table") {
          const columnCount = Math.max(...block.rows.map((row) => row.length));
          const widths = Array.from({ length: columnCount }, (_, col) =>
            Math.max(...block.rows.map((row) => (row[col] ?? "").length)),
          );
          return (
            <Box key={key} flexDirection="column">
              {block.rows.map((row, rowIndex) => (
                <Text key={`${key}-row-${rowIndex}`} bold={rowIndex === 0}>
                  {row.map((cell, colIndex) => cell.padEnd(widths[colIndex] ?? 0)).join("  ")}
                </Text>
              ))}
            </Box>
          );
        }

        return (
          <Text key={key} wrap="wrap">
            {renderInline(block.text, key, theme)}
          </Text>
        );
      })}
    </Box>
  );
}
