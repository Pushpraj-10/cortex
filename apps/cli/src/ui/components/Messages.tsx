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

/** Columns taken by the left margin of an assistant message. */
const ASSISTANT_INDENT = 2;

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
      <Box marginBottom={1} marginLeft={2}>
        <Text color={theme.status.error}>{message.content}</Text>
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

function NoticeLine({ notice }: { notice: NoticeEntry }) {
  const theme = useTheme();
  return (
    <Box marginBottom={1} marginLeft={2}>
      <Text color={theme.muted}>{notice.text}</Text>
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
