import React from "react";
import { Box, Text } from "ink";
import { maskValue } from "../../provider/setup.js";
import { locateCursor } from "../hooks/useTextInput.js";
import { maxInputBoxLines, placeholder } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface InputBoxProps {
  value: string;
  cursorOffset: number;
  /** Shows a dot per character instead of the text, for secrets. The value itself is untouched. */
  mask?: boolean;
}

export function InputBox({ value, cursorOffset, mask = false }: InputBoxProps) {
  const theme = useTheme();
  const display = mask ? maskValue(value) : value;
  const isEmpty = display.length === 0;
  const lines = isEmpty ? [""] : display.split("\n");
  const { line: cursorLine, col: cursorCol } = locateCursor(display, cursorOffset);
  const contentHeight = Math.min(lines.length, maxInputBoxLines);

  return (
    <Box borderStyle="round" borderColor={theme.border.focus} paddingX={1} width="100%">
      <Text color={theme.text.accent}>{"> "}</Text>
      {isEmpty ? (
        <Text>
          <Text inverse> </Text>
          <Text color={theme.text.secondary} dimColor>
            {placeholder}
          </Text>
        </Text>
      ) : (
        <Box flexDirection="column" height={contentHeight} overflow="hidden" justifyContent="flex-end" flexGrow={1}>
          {lines.map((line, i) => {
            if (i !== cursorLine) {
              return <Text key={i}>{line}</Text>;
            }
            const before = line.slice(0, cursorCol);
            const atCursor = line.slice(cursorCol, cursorCol + 1) || " ";
            const after = line.slice(cursorCol + 1);
            return (
              <Text key={i}>
                {before}
                <Text inverse>{atCursor}</Text>
                {after}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
