import { useStdout } from "ink";
import { createContext, useContext, useEffect, useState } from "react";

// ---- useAltScreen ----

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const SHOW_CURSOR = "\x1b[?25h";
const HIDE_CURSOR = "\x1b[?25l";

/**
 * Switches the terminal into its alternate screen buffer for the lifetime of the
 * component, so Cortex behaves like a full-screen TUI (vim, htop) rather than
 * appending to normal scrollback. Always restores the original screen and cursor
 * visibility on unmount, including on process signals, so a crash or Ctrl+C never
 * leaves the user's terminal in the alternate buffer.
 */
export function useAltScreen(): void {
  useEffect(() => {
    process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR);

    const restore = () => {
      process.stdout.write(SHOW_CURSOR + EXIT_ALT_SCREEN);
    };

    process.on("exit", restore);
    process.on("SIGINT", restore);
    process.on("SIGTERM", restore);

    return () => {
      restore();
      process.off("exit", restore);
      process.off("SIGINT", restore);
      process.off("SIGTERM", restore);
    };
  }, []);
}

// ---- useTerminalSize ----

export interface TerminalSize {
  columns: number;
  rows: number;
}

const FALLBACK_SIZE: TerminalSize = { columns: 80, rows: 24 };

/**
 * The size the app tracked once, shared with everything below it. Every `resize` listener is one more on the real stdout,
 * and Node warns (to stderr, in the middle of the full-screen UI) past ten; with a component per message that limit is
 * reached in a short conversation. So the root subscribes once and provides the size here.
 */
export const TerminalSizeContext = createContext<TerminalSize | undefined>(undefined);

/** Follows the terminal's size, subscribing only when `enabled`. */
function useWatchedSize(enabled: boolean): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => ({
    columns: stdout?.columns ?? FALLBACK_SIZE.columns,
    rows: stdout?.rows ?? FALLBACK_SIZE.rows,
  }));

  useEffect(() => {
    if (!stdout || !enabled) return;

    const handleResize = () => {
      setSize({ columns: stdout.columns ?? FALLBACK_SIZE.columns, rows: stdout.rows ?? FALLBACK_SIZE.rows });
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout, enabled]);

  return size;
}

/**
 * The terminal's current size, updating on every resize. Inside a `TerminalSizeContext` it is the shared size and adds no
 * listener of its own; with none (the root, or a component rendered on its own in a test) it subscribes itself.
 */
export function useTerminalSize(): TerminalSize {
  const shared = useContext(TerminalSizeContext);
  const own = useWatchedSize(shared === undefined);
  return shared ?? own;
}
