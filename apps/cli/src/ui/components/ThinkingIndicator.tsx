import React from "react";
import { Text } from "ink";
import { thinkingVerbRotationMs, thinkingVerbs } from "../theme/copy.js";
import { useTheme } from "../theme/ThemeContext.js";
import { useElapsedTime, useRotatingVerb, useSpinnerFrame } from "../hooks/animation.js";

interface ThinkingIndicatorProps {
  active: boolean;
}

/** Spinner, a rotating verb and the elapsed time, on one line, while the agent works. */
export function ThinkingIndicator({ active }: ThinkingIndicatorProps) {
  const theme = useTheme();
  const frame = useSpinnerFrame(active);
  const verb = useRotatingVerb(thinkingVerbs, thinkingVerbRotationMs, active);
  const elapsed = useElapsedTime(active);

  if (!active) return null;

  return (
    <Text color={theme.text.accent}>
      {frame} {verb}… <Text color={theme.text.secondary}>({elapsed}s · esc to interrupt)</Text>
    </Text>
  );
}
