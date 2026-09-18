import React from "react";
import { Box, Text } from "ink";
import { bannerArt, colors, tagline } from "../theme.js";

interface BannerProps {
  cwd: string;
}

export function Banner({ cwd }: BannerProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box borderStyle="round" borderColor={colors.accent} flexDirection="column" paddingX={1}>
        {bannerArt.map((line, i) => (
          <Text key={i} color={colors.accent} bold>
            {line}
          </Text>
        ))}
      </Box>
      <Text color={colors.muted}>{tagline}</Text>
      <Text color={colors.muted}>{cwd}</Text>
    </Box>
  );
}
