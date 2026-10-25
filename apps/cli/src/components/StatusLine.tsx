import React from "react";
import { Text } from "ink";
import { colors, statusHint } from "../theme.js";

interface StatusLineProps {
  model: string;
  mode: string;
  cwd: string;
}

export function StatusLine({ model, mode, cwd }: StatusLineProps) {
  return (
    <Text color={colors.muted} dimColor>
      {model} · {mode} · {cwd} · {statusHint}
    </Text>
  );
}
