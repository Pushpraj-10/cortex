import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/ThemeContext.js";
import type { EmblemArt } from "./emblem-art.js";

/** The braille emblem, drawn in the theme's primary colour (the terminal's own colour in mono). */
export function Emblem({ art }: { art: EmblemArt }) {
  const theme = useTheme();
  const width = art.rows[0]?.length ?? 0;

  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {art.rows.map((row, index) => (
        <Text key={index} color={theme.primary}>
          {row === "" ? " " : row}
        </Text>
      ))}
    </Box>
  );
}
