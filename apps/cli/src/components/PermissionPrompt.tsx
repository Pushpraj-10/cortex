import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

/** Two lines of text plus the border. Kept here so the layout can reserve exactly this much. */
export const PERMISSION_PROMPT_ROWS = 4;

/** Shown while the agent waits for approval of a tool call. The keys are handled by App. */
export function PermissionPrompt({ summary }: { summary: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1}>
      <Text>
        Allow <Text bold>{summary}</Text>?
      </Text>
      <Text color={colors.muted}>y / enter allow · n / esc deny</Text>
    </Box>
  );
}
