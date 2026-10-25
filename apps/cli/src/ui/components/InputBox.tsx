import React from "react";
import { Box, Text } from "ink";
import { displayWidth } from "../../format/table.js";
import { maskValue } from "../../provider/setup.js";
import { useTerminalSize } from "../hooks/terminal.js";
import { locateCursor } from "../hooks/useTextInput.js";
import { maxInputBoxLines } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface InputBoxProps {
  value: string;
  cursorOffset: number;
  /** Shows a dot per character instead of the text, for secrets. The value itself is untouched. */
  mask?: boolean;
  /** Dimmed text shown while the box is empty. */
  placeholder: string;
}

/** The left margin, then `> ` on the first row and the same width of blank on the rest, so typed lines stay aligned. */
const FIRST_ROW_PREFIX = " > ";
const NEXT_ROW_PREFIX = "   ";

/**
 * The input field: a rule above and below with nothing at the sides, and a slightly lifted band between them, with
 * a grey `>` and a block cursor. Every row's band is filled to the full width. Empty, it shows the placeholder with
 * the cursor on its first letter.
 */
export function InputBox({ value, cursorOffset, mask = false, placeholder }: InputBoxProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const band = theme.inputBackground;

  const display = mask ? maskValue(value) : value;
  const isEmpty = display.length === 0;
  const lines = isEmpty ? [""] : display.split("\n");
  const { line: cursorLine, col: cursorCol } = locateCursor(display, cursorOffset);
  const contentHeight = Math.min(lines.length, maxInputBoxLines);
  // Past the limit the box shows the last lines, where the cursor usually is.
  const firstVisible = lines.length - contentHeight;
  const visible = lines.slice(firstVisible);

  /** Fills out the band to the right edge; nothing to fill when the theme has no band. */
  const fill = (used: number) => (band ? " ".repeat(Math.max(0, columns - used)) : "");

  return (
    <Box
      borderStyle="single"
      borderColor={theme.muted}
      borderLeft={false}
      borderRight={false}
      width="100%"
      flexDirection="column"
      height={contentHeight + 2}
      overflow="hidden"
      justifyContent="flex-end"
    >
      {isEmpty ? (
        <Text backgroundColor={band}>
          <Text color={theme.muted}>{FIRST_ROW_PREFIX}</Text>
          <Text inverse>{placeholder.slice(0, 1) || " "}</Text>
          <Text color={theme.muted}>{placeholder.slice(1)}</Text>
          {fill(FIRST_ROW_PREFIX.length + displayWidth(placeholder))}
        </Text>
      ) : (
        visible.map((line, position) => {
          // The prompt sits on the first row that is showing, which is not the first line once a long entry has scrolled.
          const prefix = position === 0 ? FIRST_ROW_PREFIX : NEXT_ROW_PREFIX;
          const index = firstVisible + position;
          const onCursorRow = index === cursorLine;
          const before = onCursorRow ? line.slice(0, cursorCol) : line;
          const atCursor = onCursorRow ? line.slice(cursorCol, cursorCol + 1) || " " : "";
          const after = onCursorRow ? line.slice(cursorCol + 1) : "";
          return (
            <Text key={index} backgroundColor={band}>
              <Text color={theme.muted}>{prefix}</Text>
              {before}
              {onCursorRow && <Text inverse>{atCursor}</Text>}
              {after}
              {fill(prefix.length + displayWidth(line) + (onCursorRow && cursorCol >= line.length ? 1 : 0))}
            </Text>
          );
        })
      )}
    </Box>
  );
}
