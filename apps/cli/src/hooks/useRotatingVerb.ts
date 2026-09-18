import { useEffect, useState } from "react";

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
