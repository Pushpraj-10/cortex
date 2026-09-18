import React from "react";
import { Text } from "ink";
import { colors, thinkingVerbRotationMs, thinkingVerbs } from "../theme.js";
import { useSpinnerFrame } from "../hooks/useSpinnerFrame.js";
import { useElapsedTime } from "../hooks/useElapsedTime.js";
import { useRotatingVerb } from "../hooks/useRotatingVerb.js";

interface ThinkingIndicatorProps {
  active: boolean;
}

/** Rough fake token counter so the line has something to visibly climb while "working". */
function fakeTokenCount(elapsedSeconds: number): number {
  return elapsedSeconds * 7;
}

export function ThinkingIndicator({ active }: ThinkingIndicatorProps) {
  const frame = useSpinnerFrame(active);
  const verb = useRotatingVerb(thinkingVerbs, thinkingVerbRotationMs, active);
  const elapsed = useElapsedTime(active);

  if (!active) return null;

  return (
    <Text color={colors.accent}>
      {frame} {verb}… <Text color={colors.muted}>({elapsed}s · {fakeTokenCount(elapsed)} tokens · esc to interrupt)</Text>
    </Text>
  );
}
