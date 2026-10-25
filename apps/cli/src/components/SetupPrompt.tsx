import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme.js";

/** Two lines of text plus the border. Kept here so the layout can reserve exactly this much. */
export const SETUP_PROMPT_ROWS = 4;

interface SetupPromptProps {
  /** What is being set up, e.g. "Google Gemini". */
  title: string;
  /** The question for the current field. */
  label: string;
  /** What an empty answer does. */
  hint: string;
  /** Why the last answer was rejected; replaces the hint until the next one. */
  error?: string;
}

/** The question shown above the input box during `/provider`. The answer is typed into the input box itself. */
export function SetupPrompt({ title, label, hint, error }: SetupPromptProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.accent} paddingX={1}>
      <Text>
        <Text bold>{title}</Text> — {label}
      </Text>
      {error ? (
        <Text color={colors.error}>{error}</Text>
      ) : (
        <Text color={colors.muted}>{hint} · enter to confirm · esc to cancel</Text>
      )}
    </Box>
  );
}
