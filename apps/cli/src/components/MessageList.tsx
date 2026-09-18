import React from "react";
import { Box } from "ink";
import { Banner } from "./Banner.js";
import { MessageBubble } from "./MessageBubble.js";
import { ToolCallBlock } from "./ToolCallBlock.js";
import type { TimelineEntry } from "../types.js";

interface MessageListProps {
  cwd: string;
  height: number;
  timeline: TimelineEntry[];
  expandedToolCallIds: ReadonlySet<string>;
}

/**
 * Fixed-height viewport anchored to its bottom: the inner column can grow past
 * `height`, but `overflow="hidden"` clips it and `justifyContent="flex-end"` anchors
 * the clip to the end, so the newest content stays visible and older content scrolls
 * off the top — a tail -f effect handled entirely by Yoga's flex layout, no manual
 * line-counting needed.
 */
export function MessageList({ cwd, height, timeline, expandedToolCallIds }: MessageListProps) {
  return (
    <Box height={height} overflow="hidden" flexDirection="column" justifyContent="flex-end">
      <Box flexDirection="column">
        <Banner cwd={cwd} />
        {timeline.map((entry) =>
          entry.kind === "message" ? (
            <MessageBubble key={entry.id} message={entry} />
          ) : (
            <ToolCallBlock key={entry.id} data={entry} expanded={expandedToolCallIds.has(entry.id)} />
          ),
        )}
      </Box>
    </Box>
  );
}
