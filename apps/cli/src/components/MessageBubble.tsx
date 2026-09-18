import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import { Markdown } from "./Markdown.js";
import type { MessageEntry } from "../types.js";

interface MessageBubbleProps {
  message: MessageEntry;
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
