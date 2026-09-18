import { useEffect, useState } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  columns: number;
  rows: number;
}

const FALLBACK_SIZE: TerminalSize = { columns: 80, rows: 24 };

/** Tracks the terminal's current size, updating on every resize event. */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => ({
    columns: stdout?.columns ?? FALLBACK_SIZE.columns,
    rows: stdout?.rows ?? FALLBACK_SIZE.rows,
  }));

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setSize({ columns: stdout.columns ?? FALLBACK_SIZE.columns, rows: stdout.rows ?? FALLBACK_SIZE.rows });
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return size;
}
