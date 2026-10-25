/**
 * Renders markdown for the transcript: the blocks `parseBlocks` finds, drawn with the theme. Block layout
 * lives here (headings, lists with hanging indents, quotes, rules, spacing); code, tables and inline
 * styling are their own components, and all parsing and measuring is in format/.
 */
import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { parseBlocks, type Block, type ListItem } from "../../format/markdown.js";
import { useTheme } from "../theme/ThemeContext.js";
import { CodeBlock } from "./CodeBlock.js";
import { Inline } from "./Inline.js";
import { Table } from "./Table.js";

const BULLETS = ["•", "◦", "▪"];
const LIST_INDENT = 2;
const MAX_RULE_WIDTH = 80;

/** Blank rows between a block and the one before it: a heading hugs what follows it, and a list can follow a "Steps:" line directly. */
export function spacingBefore(previous: Block | undefined, block: Block): number {
  if (!previous) return 0;
  if (previous.type === "heading") return 0;
  if (block.type === "list" && previous.type === "paragraph" && previous.text.trimEnd().endsWith(":")) return 0;
  return 1;
}

function Heading({ level, text }: { level: number; text: string }) {
  const theme = useTheme();
  if (level <= 2) {
    return (
      <Text bold underline={level === 1} color={theme.primary}>
        <Inline text={text} />
      </Text>
    );
  }
  if (level === 3) {
    return (
      <Text bold>
        <Inline text={text} />
      </Text>
    );
  }
  return (
    <Text italic color={theme.muted}>
      <Inline text={text} />
    </Text>
  );
}

function markerOf(item: ListItem): string {
  if (item.checked !== undefined) return item.checked ? "☑" : "☐";
  if (item.number !== undefined) return `${item.number}.`;
  return BULLETS[item.depth % BULLETS.length]!;
}

function ListView({ items }: { items: ListItem[] }) {
  const theme = useTheme();
  const markers = items.map(markerOf);
  const numberWidth = Math.max(0, ...items.map((item, index) => (item.number !== undefined && item.checked === undefined ? markers[index]!.length : 0)));

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const marker = markers[index]!;
        const width = (item.number !== undefined && item.checked === undefined ? numberWidth : marker.length) + 1;
        const color = item.checked === true ? theme.status.success : item.checked === false ? theme.muted : theme.primary;
        return (
          <Box key={index} paddingLeft={item.depth * LIST_INDENT}>
            <Box width={width} flexShrink={0}>
              <Text color={color}>{marker}</Text>
            </Box>
            <Box flexGrow={1}>
              <Text wrap="wrap">
                <Inline text={item.text} />
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function BlockView({ block, width }: { block: Block; width: number }) {
  const theme = useTheme();

  switch (block.type) {
    case "heading":
      return <Heading level={block.level} text={block.text} />;
    case "paragraph":
      return (
        <Box flexDirection="column">
          {block.text.split("\n").map((line, index) => (
            <Text key={index} wrap="wrap">
              <Inline text={line} />
            </Text>
          ))}
        </Box>
      );
    case "list":
      return <ListView items={block.items} />;
    case "quote":
      return (
        <Box>
          <Text color={theme.muted}>▎ </Text>
          <Box flexDirection="column" flexGrow={1}>
            {block.text.split("\n").map((paragraph, index) => (
              <Box key={index} marginTop={index === 0 ? 0 : 1}>
                <Text wrap="wrap" color={theme.muted}>
                  <Inline text={paragraph} />
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      );
    case "code":
      return <CodeBlock language={block.language} content={block.content} />;
    case "table":
      return <Table rows={block.rows} align={block.align} width={width} />;
    case "rule":
      return <Text color={theme.border}>{"─".repeat(Math.max(1, Math.min(width, MAX_RULE_WIDTH)))}</Text>;
  }
}

/** A finished block never re-renders while a later one streams in: blocks compare by content, not by identity. */
const MemoBlockView = React.memo(BlockView, (a, b) => a.width === b.width && JSON.stringify(a.block) === JSON.stringify(b.block));

interface MarkdownProps {
  content: string;
  /** Columns available, for tables and rules. */
  width: number;
}

function MarkdownView({ content, width }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <Box flexDirection="column">
      {blocks.map((block, index) => (
        <Box key={index} flexDirection="column" marginTop={spacingBefore(blocks[index - 1], block)}>
          <MemoBlockView block={block} width={width} />
        </Box>
      ))}
    </Box>
  );
}

export const Markdown = React.memo(MarkdownView);
