import React from "react";
import { Text } from "ink";
import { colors, thinkingVerbRotationMs, thinkingVerbs } from "../theme.js";
import { useElapsedTime, useRotatingVerb, useSpinnerFrame } from "../hooks/animation.js";

interface ThinkingIndicatorProps {
  active: boolean;
}

/** Spinner, a rotating verb and the elapsed time, on one line, while the agent works. */
export function ThinkingIndicator({ active }: ThinkingIndicatorProps) {
  const frame = useSpinnerFrame(active);
  const verb = useRotatingVerb(thinkingVerbs, thinkingVerbRotationMs, active);
  const elapsed = useElapsedTime(active);

  if (!active) return null;

  return (
    <Text color={colors.accent}>
      {frame} {verb}… <Text color={colors.muted}>({elapsed}s · esc to interrupt)</Text>
    </Text>
  );
}
