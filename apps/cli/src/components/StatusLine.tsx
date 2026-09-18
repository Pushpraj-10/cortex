import React from "react";
import { Text } from "ink";
import { colors, statusHint } from "../theme.js";

interface StatusLineProps {
  model: string;
  cwd: string;
}

export function StatusLine({ model, cwd }: StatusLineProps) {
  return (
    <Text color={colors.muted} dimColor>
      {model} · {cwd} · {statusHint}
    </Text>
  );
}
