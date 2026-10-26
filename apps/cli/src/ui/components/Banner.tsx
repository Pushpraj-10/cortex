import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTerminalSize } from "../hooks/terminal.js";
import { Emblem } from "../logo/Emblem.js";
import { EMBLEM_GAP, chooseHeaderLayout, emblemFor } from "../logo/emblem-layout.js";
import { Logo } from "../logo/Logo.js";
import { pickTip, tagline } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface BannerProps {
  cwd: string;
  version: string;
}

function Info({ cwd, version, tip }: BannerProps & { tip: string }) {
  const theme = useTheme();
  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        {tagline} · <Text color={theme.secondary}>v{version}</Text>
      </Text>
      <Text color={theme.muted}>{cwd}</Text>
      <Text color={theme.muted}>
        <Text color={theme.secondary}>Tip:</Text> {tip}
      </Text>
    </Box>
  );
}

/**
 * The header at the top of the transcript. With room, the emblem stands beside the wordmark (and, on a large
 * terminal, the version, folder and a tip); on a small terminal it is the wordmark alone, as before.
 */
export function Banner({ cwd, version }: BannerProps) {
  const { columns, rows } = useTerminalSize();
  const tip = useMemo(() => pickTip(), []);
  const layout = chooseHeaderLayout(columns, rows);

  if (layout === "compact") {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Logo columns={columns} />
        <Box marginTop={1}>
          <Info cwd={cwd} version={version} tip={tip} />
        </Box>
      </Box>
    );
  }

  const art = emblemFor(layout);
  const emblemWidth = art.rows[0]?.length ?? 0;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box alignItems="center">
        <Emblem art={art} />
        <Box flexDirection="column" justifyContent="center" marginLeft={EMBLEM_GAP} flexShrink={1}>
          <Logo columns={columns - emblemWidth - EMBLEM_GAP} />
          {layout === "large" && (
            <Box marginTop={1}>
              <Info cwd={cwd} version={version} tip={tip} />
            </Box>
          )}
        </Box>
      </Box>
      {layout === "medium" && (
        <Box marginTop={1}>
          <Info cwd={cwd} version={version} tip={tip} />
        </Box>
      )}
    </Box>
  );
}
