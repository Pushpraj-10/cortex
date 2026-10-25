import React from "react";
import { Box, Text } from "ink";
import { chooseLogo } from "./pixel-logo.js";
import { useTheme } from "../theme/ThemeContext.js";

/** The wordmark, sized to `columns` and drawn in the theme's primary colour. */
export function Logo({ columns }: { columns: number }) {
  const theme = useTheme();
  const art = chooseLogo(columns);

  return (
    <Box flexDirection="column">
      {art.rows.map((row, index) => (
        <Text key={index} bold color={theme.primary}>
          {row}
        </Text>
      ))}
    </Box>
  );
}
