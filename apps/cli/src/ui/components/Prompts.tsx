import React from "react";
import { Box, Text } from "ink";
import type { ToolPreview } from "@cortex/tools";
import { useTheme } from "../theme/ThemeContext.js";
import { Preview } from "../toolcalls/Preview.js";
import { changeStats, previewRows } from "../toolcalls/preview-model.js";

// The two prompts that take over the area above the input box. Each is a fixed number of rows, which the
// layout reserves exactly, so every line in them is pinned to one row.

// ---- PermissionPrompt ----

/** The border, the question and the key hint: what the prompt takes before any preview. */
const PERMISSION_PROMPT_BASE_ROWS = 4;
/** Columns the border and its padding take away from the preview. */
const PERMISSION_PROMPT_FRAME_COLUMNS = 4;

/** Rows the approval prompt takes with `preview` shown at most `maxPreviewLines` tall. */
export function permissionPromptRows(preview: ToolPreview | undefined, maxPreviewLines: number): number {
  return PERMISSION_PROMPT_BASE_ROWS + previewRows(preview, maxPreviewLines);
}

interface PermissionPromptProps {
  summary: string;
  /** What the call will change, if its tool can say: shown so the answer is an informed one. */
  preview?: ToolPreview;
  /** Columns available to the whole prompt. */
  width: number;
  maxPreviewLines: number;
}

/** Shown while the agent waits for approval of a tool call: what it is, what it will change, and the keys. The keys are handled by App. */
export function PermissionPrompt({ summary, preview, width, maxPreviewLines }: PermissionPromptProps) {
  const theme = useTheme();
  const stats = changeStats(preview);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.primary} paddingX={1}>
      <Text wrap="truncate-end">
        Allow <Text bold>{summary}</Text>
        {stats && (
          <Text color={theme.muted}>
            {" ("}
            {stats.isNew ? "new, " : ""}
            <Text color={theme.status.success}>+{stats.added}</Text>
            {stats.removed > 0 && (
              <>
                {" "}
                <Text color={theme.status.error}>-{stats.removed}</Text>
              </>
            )}
            {")"}
          </Text>
        )}
        ?
      </Text>
      {preview && <Preview preview={preview} width={Math.max(10, width - PERMISSION_PROMPT_FRAME_COLUMNS)} maxLines={maxPreviewLines} truncate />}
      <Text color={theme.muted}>y / enter allow · n / esc deny</Text>
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
    <Box flexDirection="column" borderStyle="round" borderColor={theme.primary} paddingX={1}>
      <Text>
        <Text bold>{title}</Text> — {label}
      </Text>
      {error ? (
        <Text color={theme.status.error}>{error}</Text>
      ) : (
        <Text color={theme.muted}>{hint} · enter to confirm · esc to cancel</Text>
      )}
    </Box>
  );
}
