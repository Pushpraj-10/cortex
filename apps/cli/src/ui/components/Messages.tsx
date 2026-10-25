/** The transcript: the scrolling viewport and the three things in it — messages, tool calls and notices. */
import React from "react";
import { Box, Text } from "ink";
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
}

/**
 * Fixed-height viewport anchored to its bottom: the inner column can grow past `height`, but
 * `overflow="hidden"` clips it and `justifyContent="flex-end"` anchors the clip to the end, so the
 * newest content stays visible and older content scrolls off the top — a tail -f effect handled
 * entirely by Yoga's flex layout, no manual line-counting needed.
 */
export function MessageList({ cwd, version, height, timeline, expandedToolCallIds }: MessageListProps) {
  const { columns } = useTerminalSize();
  return (
    <Box height={height} overflow="hidden" flexDirection="column" justifyContent="flex-end">
      <Box flexDirection="column">
        <Banner cwd={cwd} version={version} />
        {timeline.map((entry) => {
          if (entry.kind === "message") return <MessageBubble key={entry.id} message={entry} />;
          if (entry.kind === "notice") return <NoticeLine key={entry.id} notice={entry} />;
          return <ToolCall key={entry.id} entry={entry} expanded={expandedToolCallIds.has(entry.id)} width={columns} />;
        })}
      </Box>
    </Box>
  );
}
