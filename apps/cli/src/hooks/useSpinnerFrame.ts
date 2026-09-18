import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_INTERVAL_MS = 80;

/** Cycles through braille spinner frames while `active` is true. */
export function useSpinnerFrame(active: boolean): string {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setFrameIndex((current) => (current + 1) % FRAMES.length);
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [active]);

  return FRAMES[frameIndex] ?? FRAMES[0]!;
}
