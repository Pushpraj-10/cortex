import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";
import type { ToolCallEntry } from "../types.js";

interface ToolCallBlockProps {
  data: ToolCallEntry;
  expanded: boolean;
}

/**
 * Collapsed by default: one line with a bullet icon and summary. Expanded shows an
 * indented detail block. `expanded` is controlled by the parent (see App's Ctrl+T
 * handler) rather than owned here, since which blocks are open is conversation-level
 * state, not per-component state.
 */
export function ToolCallBlock({ data, expanded }: ToolCallBlockProps) {
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
