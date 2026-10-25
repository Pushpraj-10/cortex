import { useEffect, useState } from "react";

// ---- useSpinnerFrame ----

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

// ---- useRotatingVerb ----

/** Cycles through `verbs` every `intervalMs` while `active` is true. */
export function useRotatingVerb(verbs: string[], intervalMs: number, active: boolean): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setIndex((current) => (current + 1) % verbs.length);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [active, verbs, intervalMs]);

  return verbs[index] ?? verbs[0]!;
}

// ---- useElapsedTime ----

/** Seconds elapsed since `active` became true; resets to 0 when it becomes false. */
export function useElapsedTime(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setSeconds(0);
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);

  return seconds;
}
