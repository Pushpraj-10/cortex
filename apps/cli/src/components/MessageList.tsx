import React from "react";
import { Box } from "ink";
import { Banner } from "./Banner.js";
import { MessageBubble } from "./MessageBubble.js";
import { ToolCallBlock } from "./ToolCallBlock.js";
import type { Message, ToolCallData } from "../types.js";

interface MessageListProps {
  cwd: string;
  height: number;
  messages: Message[];
  toolCalls: ToolCallData[];
  expandedToolCallIds: ReadonlySet<string>;
}

/**
 * Fixed-height viewport anchored to its bottom: the inner column can grow past
 * `height`, but `overflow="hidden"` clips it and `justifyContent="flex-end"` anchors
 * the clip to the end, so the newest content stays visible and older content scrolls
 * off the top — a tail -f effect handled entirely by Yoga's flex layout, no manual
 * line-counting needed.
 */
export function MessageList({ cwd, height, messages, toolCalls, expandedToolCallIds }: MessageListProps) {
  return (
    <Box height={height} overflow="hidden" flexDirection="column" justifyContent="flex-end">
      <Box flexDirection="column">
        <Banner cwd={cwd} />
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {toolCalls.length > 0 && (
          <Box flexDirection="column" marginBottom={1}>
            {toolCalls.map((toolCall) => (
              <ToolCallBlock key={toolCall.id} data={toolCall} expanded={expandedToolCallIds.has(toolCall.id)} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
