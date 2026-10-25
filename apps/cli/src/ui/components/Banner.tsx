import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/terminal.js";
import { Logo } from "../logo/Logo.js";
import { pickTip, tagline } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface BannerProps {
  cwd: string;
  version: string;
}

/** The header at the top of the transcript: the wordmark, the version and tagline, the folder, and one tip. */
export function Banner({ cwd, version }: BannerProps) {
  const theme = useTheme();
  const { columns } = useTerminalSize();
  const tip = useMemo(() => pickTip(), []);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Logo columns={columns} />
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {tagline} · v{version}
        </Text>
      </Box>
      <Text color={theme.text.secondary}>{cwd}</Text>
      <Text color={theme.text.secondary}>Tip: {tip}</Text>
    </Box>
  );
}
