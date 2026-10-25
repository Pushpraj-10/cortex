import React from "react";
import { Box, Text } from "ink";
import { shortcutsHint } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface StatusLineProps {
  model: string;
  mode: string;
  cwd: string;
}

/** How each non-default permission mode is announced; the default mode says nothing. */
const MODE_NOTES: Record<string, string> = {
  acceptEdits: "accept edits on",
  plan: "plan mode on",
  bypassPermissions: "bypass permissions on",
};

/**
 * The bottom line. On the left, `? for shortcuts`, or the permission mode when it is not the default so it is never
 * a surprise; on the right the model and the folder, with the folder shortened from its start when space is short.
 */
export function StatusLine({ model, mode, cwd }: StatusLineProps) {
  const theme = useTheme();
  const note = MODE_NOTES[mode];

  return (
    <Box justifyContent="space-between" width="100%" paddingX={1}>
      <Box flexShrink={0}>
        {note ? (
          <Text color={theme.muted}>
            <Text color={theme.primary}>⏵⏵ {note}</Text> (shift+tab to cycle)
          </Text>
        ) : (
          <Text color={theme.muted}>{shortcutsHint}</Text>
        )}
      </Box>
      <Box flexShrink={1} marginLeft={2}>
        <Box flexShrink={0}>
          <Text color={theme.secondary}>{model}</Text>
          <Text color={theme.muted}> · </Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={theme.muted} wrap="truncate-start">
            {cwd}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
