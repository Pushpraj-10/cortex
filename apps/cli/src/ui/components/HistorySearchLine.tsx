import React from "react";
import { Text } from "ink";
import { displayWidth } from "../../format/table.js";
import { useTerminalSize } from "../hooks/terminal.js";
import { useTheme } from "../theme/ThemeContext.js";

interface HistorySearchLineProps {
  query: string;
  /** Which match is shown and how many there are; none when the query matches nothing. */
  position?: { current: number; total: number };
}

const LABEL = " reverse search: ";

/**
 * The ctrl+r line above the input box, which shows the match itself. Always exactly one row (the layout reserves one), so
 * on a narrow terminal it gives up its details from the least important: the key hints, then the position.
 */
export function HistorySearchLine({ query, position }: HistorySearchLineProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();

  const where = position ? `${position.current}/${position.total}` : "no matches";
  const details = position
    ? [`(${where} · ctrl+r for older · enter to use · esc to cancel)`, `(${where} · enter to use)`, `(${where})`, ""]
    : [`(${where} · esc to cancel)`, `(${where})`, ""];
  // The label, the query and the cursor block come first; the details are tried from the most to the least.
  const used = displayWidth(LABEL) + displayWidth(query) + 1;
  const detail = details.find((text) => used + (text ? 1 + displayWidth(text) : 0) <= columns) ?? "";

  return (
    <Text wrap="truncate-end">
      <Text color={theme.muted}>{LABEL}</Text>
      <Text color={theme.primary}>{query}</Text>
      <Text inverse> </Text>
      {detail && <Text color={theme.muted}> {detail}</Text>}
    </Text>
  );
}
