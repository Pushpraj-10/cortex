import React from "react";
import { Box, Text } from "ink";
import { formatDuration, type ToolStatus } from "../../format/tool-calls.js";
import { useSpinnerFrame } from "../hooks/animation.js";
import { useTheme } from "../theme/ThemeContext.js";
import type { Theme } from "../theme/themes.js";
import type { ToolCallEntry } from "../types.js";
import { Preview } from "./Preview.js";
import { changeStats } from "./preview-model.js";

/** Lines of a diff shown by default, and when the call is expanded with ctrl+t. */
const SHOWN_LINES = 12;
const EXPANDED_LINES = 400;
/** Last lines of a command's output shown by default. */
const OUTPUT_TAIL = 8;
/** Calls faster than this do not get a duration; "0.0s" says nothing. */
const MIN_DURATION_MS = 100;

function glyphOf(status: ToolStatus, spinner: string, theme: Theme): { text: string; color: string | undefined } {
  switch (status) {
    case "running":
      return { text: spinner, color: theme.primary };
    case "awaiting":
      return { text: "?", color: theme.status.warning };
    case "success":
      return { text: "✓", color: theme.status.success };
    case "error":
      return { text: "✗", color: theme.status.error };
    case "declined":
    case "cancelled":
      return { text: "⊘", color: theme.muted };
  }
}

interface ToolCallProps {
  entry: ToolCallEntry;
  /** Opened with ctrl+t: the whole diff, and the whole output of a command or the result of any other call. */
  expanded: boolean;
  /** Columns available to the whole block. */
  width: number;
}

/**
 * One tool call in the transcript: a header with its status, what it changed (`+3 -1`) and how long it took, then
 * what is worth seeing under it. An edit shows its diff, a command its output, and a call that did not go
 * through says why. Everything else stays to the header until it is expanded.
 */
export function ToolCall({ entry, expanded, width }: ToolCallProps) {
  const theme = useTheme();
  const spinner = useSpinnerFrame(entry.status === "running");
  const glyph = glyphOf(entry.status, spinner, theme);
  const inner = Math.max(10, width - 2);

  const stopped = entry.status === "declined" || entry.status === "cancelled";
  // A change that was declined, failed or interrupted did not happen, so neither its diff nor its +/- counts are shown as if it had.
  const showsChange = entry.preview !== undefined && entry.preview.kind === "diff" && (entry.status === "running" || entry.status === "awaiting" || entry.status === "success");
  const stats = showsChange ? changeStats(entry.preview) : undefined;
  const finished = entry.status === "success" || entry.status === "error";
  const outputLines = entry.toolKind === "execute" && finished && entry.detail !== "" ? entry.detail.split("\n") : [];
  const shownOutput = expanded ? outputLines : outputLines.slice(-OUTPUT_TAIL);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text color={glyph.color} bold>
          {glyph.text}
        </Text>{" "}
        <Text color={stopped ? theme.muted : undefined}>{entry.summary}</Text>
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
        {entry.durationMs !== undefined && entry.durationMs >= MIN_DURATION_MS && <Text color={theme.muted}> · {formatDuration(entry.durationMs)}</Text>}
      </Text>

      <Box flexDirection="column" marginLeft={2}>
        {(entry.status === "error" || stopped) && entry.error && (
          <Text color={entry.status === "error" ? theme.status.error : theme.muted} wrap="wrap">
            ↳ {entry.error}
          </Text>
        )}

        {showsChange && entry.preview && <Preview preview={entry.preview} width={inner} maxLines={expanded ? EXPANDED_LINES : SHOWN_LINES} expandHint={!expanded} />}

        {shownOutput.length > 0 && (
          <Box flexDirection="column">
            {shownOutput.length < outputLines.length && (
              <Text color={theme.muted}>
                … {outputLines.length - shownOutput.length} earlier lines (ctrl+t to expand)
              </Text>
            )}
            {shownOutput.map((line, index) => (
              <Text key={index} color={theme.muted} wrap="wrap">
                {line === "" ? " " : line}
              </Text>
            ))}
          </Box>
        )}

        {expanded && !showsChange && outputLines.length === 0 && entry.detail !== "" && (
          <Box borderStyle="round" borderColor={theme.border} paddingX={1}>
            <Text color={theme.muted}>{entry.detail}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
