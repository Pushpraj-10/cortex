import React from "react";
import { Text } from "ink";
import { estimateTokensFromChars, formatTokenCount } from "../../format/counts.js";
import { displayWidth } from "../../format/table.js";
import { thinkingVerbRotationMs, thinkingVerbs } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";
import { useElapsedTime, useRotatingVerb, useSpinnerFrame } from "../hooks/animation.js";
import { useTerminalSize } from "../hooks/terminal.js";

interface ThinkingIndicatorProps {
  active: boolean;
  /** Characters of reply text written so far in this request; shown as a rough token count once there is some. */
  outputChars?: number;
}

/**
 * Spinner, a rotating verb, the elapsed time and, while text streams in, how much has been written. It is always exactly one
 * row (the layout reserves one), so on a narrow terminal it gives up its details from the least important: the interrupt
 * hint, then the token count, then the elapsed time.
 */
export function ThinkingIndicator({ active, outputChars = 0 }: ThinkingIndicatorProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const frame = useSpinnerFrame(active);
  const verb = useRotatingVerb(thinkingVerbs, thinkingVerbRotationMs, active);
  const elapsed = useElapsedTime(active);

  if (!active) return null;

  const written = outputChars > 0 ? ` · ↓ ${formatTokenCount(estimateTokensFromChars(outputChars))} tokens` : "";
  // The spinner and its space take two columns; the details are tried from the most to the least.
  const details = [`(${elapsed}s${written} · esc to interrupt)`, `(${elapsed}s${written})`, `(${elapsed}s)`, ""];
  const detail = details.find((text) => 2 + displayWidth(`${verb}…${text ? ` ${text}` : ""}`) <= columns) ?? "";

  return (
    <Text color={theme.primary} wrap="truncate-end">
      {frame} {verb}…{detail ? " " : ""}
      {detail && <Text color={theme.muted}>{detail}</Text>}
    </Text>
  );
}
