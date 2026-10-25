import React from "react";
import { Box, Text } from "ink";
import { locateCursor } from "../text-edit.js";
import { colors, maxInputBoxLines, placeholder } from "../theme.js";

interface InputBoxProps {
  value: string;
  cursorOffset: number;
}

export function InputBox({ value, cursorOffset }: InputBoxProps) {
  const isEmpty = value.length === 0;
  const lines = isEmpty ? [""] : value.split("\n");
  const { line: cursorLine, col: cursorCol } = locateCursor(value, cursorOffset);
  const contentHeight = Math.min(lines.length, maxInputBoxLines);

  return (
    <Box borderStyle="round" borderColor={colors.accent} paddingX={1} width="100%">
      <Text color={colors.accent}>{"> "}</Text>
      {isEmpty ? (
        <Text>
          <Text inverse> </Text>
          <Text color={colors.muted} dimColor>
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
