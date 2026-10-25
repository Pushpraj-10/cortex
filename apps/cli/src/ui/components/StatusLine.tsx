import React from "react";
import { Text } from "ink";
import { statusHint } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface StatusLineProps {
  model: string;
  mode: string;
  cwd: string;
}

/** The bottom line: the model in the secondary colour, the permission mode in the primary, the rest muted. */
export function StatusLine({ model, mode, cwd }: StatusLineProps) {
  const theme = useTheme();
  return (
    <Text color={theme.muted}>
      <Text color={theme.secondary}>{model}</Text> · <Text color={theme.primary}>{mode}</Text> · {cwd} · {statusHint}
    </Text>
  );
}
