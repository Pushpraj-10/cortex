import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTheme } from "../theme/ThemeContext.js";
import type { Theme } from "../theme/themes.js";
import type { EmblemArt } from "./emblem-art.js";
import { emblemRuns, type EmblemTone } from "./emblem-layout.js";

/** The logo's red is the theme's primary; its dark panel is drawn in the theme's whitish grey (a dark grey on the light theme). */
function colourOf(tone: EmblemTone | undefined, theme: Theme): string | undefined {
  if (tone === undefined) return undefined;
  return tone === "primary" ? theme.primary : theme.secondary;
}

/** The braille emblem: the red C in the theme's primary colour and its terminal panel in a whitish grey (both the terminal's own colour in mono). */
export function Emblem({ art }: { art: EmblemArt }) {
  const theme = useTheme();
  const lines = useMemo(() => emblemRuns(art), [art]);
  const width = art.rows[0]?.length ?? 0;

  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {lines.map((runs, index) => (
        <Text key={index}>
          {runs.length === 0
            ? " "
            : runs.map((run, at) => (
                <Text key={at} color={colourOf(run.tone, theme)}>
                  {run.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  );
}
