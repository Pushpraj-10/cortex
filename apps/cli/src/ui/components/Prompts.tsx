import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/ThemeContext.js";

// The two prompts that take over the area above the input box. Each is two lines of text plus a border,
// and exports its row count so the layout can reserve exactly that much.

// ---- PermissionPrompt ----

export const PERMISSION_PROMPT_ROWS = 4;

/** Shown while the agent waits for approval of a tool call. The keys are handled by App. */
export function PermissionPrompt({ summary }: { summary: string }) {
  const theme = useTheme();
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border.focus} paddingX={1}>
      <Text>
        Allow <Text bold>{summary}</Text>?
      </Text>
      <Text color={theme.text.secondary}>y / enter allow · n / esc deny</Text>
    </Box>
  );
}

// ---- SetupPrompt ----

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
  const theme = useTheme();
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border.focus} paddingX={1}>
      <Text>
        <Text bold>{title}</Text> — {label}
      </Text>
      {error ? (
        <Text color={theme.status.error}>{error}</Text>
      ) : (
        <Text color={theme.text.secondary}>{hint} · enter to confirm · esc to cancel</Text>
      )}
    </Box>
  );
}
