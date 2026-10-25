import React from "react";
import { Box, Text } from "ink";
import { chooseLogo } from "./pixel-logo.js";
import { gradientColors } from "../theme/gradient.js";
import { useTheme } from "../theme/ThemeContext.js";

/** The wordmark, sized to `columns` and coloured left to right along the theme's gradient (flat in mono). */
export function Logo({ columns }: { columns: number }) {
  const theme = useTheme();
  const art = chooseLogo(columns);
  const colors = gradientColors(theme.gradient, art.width);

  return (
    <Box flexDirection="column">
      {art.rows.map((row, rowIndex) =>
        colors.length === 0 ? (
          <Text key={rowIndex} bold color={theme.text.accent}>
            {row}
          </Text>
        ) : (
          <Text key={rowIndex} bold>
            {[...row].map((char, column) => (
              <Text key={column} color={colors[column]}>
                {char}
              </Text>
            ))}
          </Text>
        ),
      )}
    </Box>
  );
}
