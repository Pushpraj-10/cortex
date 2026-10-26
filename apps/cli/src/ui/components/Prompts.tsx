import React from "react";
import { Box } from "ink";
import type { ToolPreview } from "@cortex/tools";
import type { Piece } from "../../format/panel.js";
import type { PermissionChoice } from "../../format/permission-choices.js";
import { useTheme } from "../theme/ThemeContext.js";
import { Preview } from "../toolcalls/Preview.js";
import { changeStats, previewRows } from "../toolcalls/preview-model.js";
import { PanelRow } from "./Overlay.js";

// The two prompts drawn over the transcript (see Overlay), as rows of a panel with no border. Each is a fixed number of
// rows, which the layout counts exactly, so every line in them is pinned to one row.

// ---- PermissionPrompt ----

/** A blank row, the title, the question and the key hint: what the prompt takes besides the choices and any preview. */
const PERMISSION_PROMPT_BASE_ROWS = 4;
/** Columns the panel's indent and margin take away from the preview. */
const PERMISSION_PROMPT_FRAME_COLUMNS = 2;

/** Rows the approval prompt takes with `choiceCount` choices and `preview` shown at most `maxPreviewLines` tall. */
export function permissionPromptRows(preview: ToolPreview | undefined, maxPreviewLines: number, choiceCount: number): number {
  return PERMISSION_PROMPT_BASE_ROWS + choiceCount + previewRows(preview, maxPreviewLines);
}

interface PermissionPromptProps {
  summary: string;
  /** What the call will change, if its tool can say: shown so the answer is an informed one. */
  preview?: ToolPreview;
  /** Columns available to the whole prompt. */
  width: number;
  maxPreviewLines: number;
  /** The answers on offer, top to bottom. */
  choices: PermissionChoice[];
  /** Which of them the arrow keys are on. */
  selectedIndex: number;
}

/**
 * Shown while the agent waits for approval of a tool call, in place of the input box: what the call is, what it will
 * change, and the answers to pick from. The keys are handled by App.
 */
export function PermissionPrompt({ summary, preview, width, maxPreviewLines, choices, selectedIndex }: PermissionPromptProps) {
  const theme = useTheme();
  const stats = changeStats(preview);

  const title: Piece[] = [{ text: summary, bold: true }];
  if (stats) {
    title.push({ text: " (", color: theme.muted });
    if (stats.isNew) title.push({ text: "new, ", color: theme.muted });
    title.push({ text: `+${stats.added}`, color: theme.status.success });
    if (stats.removed > 0) {
      title.push({ text: " ", color: theme.muted });
      title.push({ text: `-${stats.removed}`, color: theme.status.error });
    }
    title.push({ text: ")", color: theme.muted });
  }

  return (
    <Box flexDirection="column">
      <PanelRow pieces={[]} />
      <PanelRow pieces={title} />
      {preview && <Preview panel preview={preview} width={Math.max(10, width - PERMISSION_PROMPT_FRAME_COLUMNS)} maxLines={maxPreviewLines} truncate />}
      <PanelRow pieces={[{ text: "Do you want to proceed?" }]} />
      {choices.map((choice, index) => {
        const selected = index === selectedIndex;
        const pieces: Piece[] = [
          { text: selected ? "❯ " : "  ", color: theme.primary },
          { text: `${index + 1}. ${choice.label}`, color: selected ? theme.primary : undefined, bold: selected },
        ];
        if (choice.hint) pieces.push({ text: ` (${choice.hint})`, color: theme.muted });
        return <PanelRow key={index} pieces={pieces} />;
      })}
      <PanelRow pieces={[{ text: "↑/↓ to select · enter to confirm · esc to deny", color: theme.muted }]} />
    </Box>
  );
}

// ---- SetupPrompt ----

export const SETUP_PROMPT_ROWS = 2;

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
    <Box flexDirection="column">
      <PanelRow pieces={[{ text: title, bold: true }, { text: ` — ${label}` }]} />
      <PanelRow pieces={error ? [{ text: error, color: theme.status.error }] : [{ text: `${hint} · enter to confirm · esc to cancel`, color: theme.muted }]} />
    </Box>
  );
}
