import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import { Markdown } from "./Markdown.js";
import type { Message } from "../types.js";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <Box marginBottom={1}>
        <Text color={colors.accent}>{"> "}</Text>
        <Text>{message.content}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>
      <Markdown content={message.content} />
    </Box>
  );
}
