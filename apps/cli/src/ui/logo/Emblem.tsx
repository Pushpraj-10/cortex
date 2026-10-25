import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { gradientAt } from "../theme/gradient.js";
import { useTheme } from "../theme/ThemeContext.js";
import type { EmblemArt } from "./emblem-art.js";
import { emblemRuns } from "./emblem-layout.js";

/**
 * The braille emblem. Each cell is coloured by its tone (0 to 9) along the theme's gradient, so the logo's
 * green-to-cyan fade follows the theme; in mono there is no gradient and it is drawn in the terminal's own colour.
 */
export function Emblem({ art }: { art: EmblemArt }) {
  const theme = useTheme();
  const lines = useMemo(() => emblemRuns(art), [art]);
  const width = art.rows[0]?.length ?? 0;

  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {lines.map((runs, y) => (
        <Text key={y}>
          {runs.map((run, index) => (
            <Text key={index} color={run.tone === undefined ? undefined : (gradientAt(theme.gradient, run.tone / 9) ?? theme.text.accent)}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
