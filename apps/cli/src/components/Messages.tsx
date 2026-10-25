/** The transcript: the scrolling viewport and the three things in it — messages, tool calls and notices. */
import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import type { MessageEntry, NoticeEntry, TimelineEntry, ToolCallEntry } from "../types.js";
import { Banner } from "./Banner.js";
import { Markdown } from "./Markdown.js";

// ---- Message ---------------------------------------------------------------------

export function MessageBubble({ message }: { message: MessageEntry }) {
  if (message.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text color={colors.accent}>{"> "}</Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  if (message.isError) {
    return (
      <Box marginBottom={1} marginLeft={2}>
        <Text color={colors.error}>{message.content}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      <Markdown content={message.content} />
    </Box>
  );
}

// ---- Tool call -------------------------------------------------------------------

/**
 * Collapsed by default: one line with a bullet icon and summary. Expanded shows an indented detail
 * block. `expanded` is controlled by the parent (Ctrl+T) rather than owned here, since which blocks
 * are open is conversation-level state, not per-component state.
 */
export function ToolCallBlock({ data, expanded }: { data: ToolCallEntry; expanded: boolean }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={colors.accent}>{expanded ? "⏺" : "●"}</Text> {data.summary}
      </Text>
      {expanded && (
        <Box marginLeft={2} borderStyle="round" borderColor={colors.muted} paddingX={1}>
          <Text color={colors.muted}>{data.detail}</Text>
        </Box>
      )}
    </Box>
  );
}

// ---- Notice ----------------------------------------------------------------------

function NoticeLine({ notice }: { notice: NoticeEntry }) {
  return (
    <Box marginBottom={1} marginLeft={2}>
      <Text color={colors.muted}>{notice.text}</Text>
    </Box>
  );
}

// ---- Viewport --------------------------------------------------------------------

interface MessageListProps {
  cwd: string;
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
export function MessageList({ cwd, height, timeline, expandedToolCallIds }: MessageListProps) {
  return (
    <Box height={height} overflow="hidden" flexDirection="column" justifyContent="flex-end">
      <Box flexDirection="column">
        <Banner cwd={cwd} />
        {timeline.map((entry) => {
          if (entry.kind === "message") return <MessageBubble key={entry.id} message={entry} />;
          if (entry.kind === "notice") return <NoticeLine key={entry.id} notice={entry} />;
          return <ToolCallBlock key={entry.id} data={entry} expanded={expandedToolCallIds.has(entry.id)} />;
        })}
      </Box>
    </Box>
  );
}
