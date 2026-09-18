import { useEffect, useState } from "react";

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
