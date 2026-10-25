import React from "react";
import { Text } from "ink";
import { statusHint } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";

interface StatusLineProps {
  model: string;
  mode: string;
  cwd: string;
}

export function StatusLine({ model, mode, cwd }: StatusLineProps) {
  const theme = useTheme();
  return (
    <Text color={theme.text.secondary} dimColor>
      {model} · {mode} · {cwd} · {statusHint}
    </Text>
  );
}
