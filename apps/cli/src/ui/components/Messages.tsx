/** The transcript: the scrolling viewport and the three things in it — messages, tool calls and notices. */
import React, { useEffect, useRef, useState } from "react";
import { Box, Text, measureElement, type DOMElement } from "ink";
import { displayWidth } from "../../format/table.js";
import { useTheme } from "../theme/ThemeContext.js";
import type { MessageEntry, NoticeEntry, TimelineEntry } from "../types.js";
import { useTerminalSize } from "../hooks/terminal.js";
import { Markdown } from "../markdown/Markdown.js";
import { ToolCall } from "../toolcalls/ToolCall.js";
import { Banner } from "./Banner.js";

// ---- Message ---------------------------------------------------------------------

/** Columns taken by the left margin of an assistant message, which is also the gutter an icon sits in (the tool-call glyphs use the same two columns). */
const ASSISTANT_INDENT = 2;
const GUTTER = ASSISTANT_INDENT;

export function MessageBubble({ message }: { message: MessageEntry }) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  if (message.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text color={theme.primary}>{"> "}</Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  if (message.isError) {
    return (
      <Box marginBottom={1}>
        <Box width={GUTTER} flexShrink={0}>
          <Text color={theme.status.error}>✗</Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={theme.status.error} wrap="wrap">
            {message.content}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={ASSISTANT_INDENT}>
      <Markdown content={message.content} width={Math.max(10, columns - ASSISTANT_INDENT)} />
    </Box>
  );
}

// ---- Notice ----------------------------------------------------------------------

export function NoticeLine({ notice }: { notice: NoticeEntry }) {
  const theme = useTheme();
  return (
    <Box marginBottom={1}>
      <Box width={GUTTER} flexShrink={0}>
        <Text color={theme.muted}>·</Text>
      </Box>
      <Box flexGrow={1}>
        <Text color={theme.muted} wrap="wrap">
          {notice.text}
        </Text>
      </Box>
    </Box>
  );
}

// ---- Viewport --------------------------------------------------------------------

interface MessageListProps {
  cwd: string;
  version: string;
  height: number;
  timeline: TimelineEntry[];
  expandedToolCallIds: ReadonlySet<string>;
  /** Rows scrolled up from the bottom; 0 (the default) follows the newest content. */
  scrollOffset?: number;
  /** Called after each layout with the transcript's full height and the rows its viewport shows, so the owner can limit scrolling. */
  onMeasure?(contentHeight: number, viewportHeight: number): void;
}

/** One row, shown while scrolled up, saying how far and how to get back; the longest wording that fits the width. */
function ScrollNotice({ rows, columns }: { rows: number; columns: number }) {
  const theme = useTheme();
  const below = `↓ ${rows} ${rows === 1 ? "row" : "rows"} below`;
  const options = [`${below} · pagedown for newer · send a message to jump to the end`, `${below} · pagedown for newer`, below];
  const text = options.find((option) => 2 + displayWidth(option) <= columns) ?? below;
  return (
    <Text color={theme.muted} wrap="truncate-end">
      {`  ${text}`}
    </Text>
  );
}

/**
 * Fixed-height viewport. While the transcript fits, it starts at the top (the banner is the first row of the screen, as in
 * Claude Code). Once it outgrows `height` it is anchored to the bottom: `overflow="hidden"` clips the inner column and
 * `justifyContent="flex-end"` anchors the clip to the end, so the newest content stays visible and older content scrolls off
 * the top — a tail -f effect handled entirely by Yoga's flex layout, no manual line-counting needed.
 *
 * The inner column must not shrink (`flexShrink={0}`). By default Yoga squeezes it, and everything in it, to fit the
 * viewport: rows overlap, spacing disappears, and what is left on screen is the start of the conversation instead of its end.
 */
export function MessageList({ cwd, version, height, timeline, expandedToolCallIds, scrollOffset = 0, onMeasure }: MessageListProps) {
  const { columns } = useTerminalSize();
  // Scrolled up, one row of the region goes to the notice; the rest is the viewport.
  const scrolled = scrollOffset > 0;
  const viewport = Math.max(1, height - (scrolled ? 1 : 0));

  // The inner column keeps its full height (it does not shrink), so its measured height is the whole transcript's.
  const content = useRef<DOMElement>(null);
  // Whether the whole transcript fits in the viewport. Until measured it is assumed to, so the banner starts at the top.
  const [fits, setFits] = useState(true);
  useEffect(() => {
    if (!content.current) return;
    const contentHeight = measureElement(content.current).height;
    setFits(contentHeight <= viewport); // the same value again does not render again
    onMeasure?.(contentHeight, viewport);
  });

  // Scrolling is a negative bottom margin: it slides the column down past the viewport's bottom edge, which the clip hides,
  // bringing older rows in at the top.
  return (
    <Box height={height} flexDirection="column">
      <Box height={viewport} overflow="hidden" flexDirection="column" justifyContent={fits ? "flex-start" : "flex-end"}>
        <Box ref={content} flexDirection="column" flexShrink={0} marginBottom={-scrollOffset}>
          <Banner cwd={cwd} version={version} />
          {timeline.map((entry) => {
            if (entry.kind === "message") return <MessageBubble key={entry.id} message={entry} />;
            if (entry.kind === "notice") return <NoticeLine key={entry.id} notice={entry} />;
            return <ToolCall key={entry.id} entry={entry} expanded={expandedToolCallIds.has(entry.id)} width={columns} />;
          })}
        </Box>
      </Box>
      {scrolled && <ScrollNotice rows={scrollOffset} columns={columns} />}
    </Box>
  );
}
