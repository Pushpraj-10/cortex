import { useStdout } from "ink";
import { createContext, useContext, useEffect, useState } from "react";

// ---- alternate screen ----

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const SHOW_CURSOR = "\x1b[?25h";
const HIDE_CURSOR = "\x1b[?25l";
/** Mouse reporting (button events, in the SGR form): the wheel scrolls the transcript. The terminal's own click-and-drag selection then needs shift held. */
const MOUSE_ON = "\x1b[?1000h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1006l\x1b[?1000l";
/** Clears the visible screen and puts the cursor at the top left. */
const ERASE_SCREEN = "\x1b[2J\x1b[H";

let inAltScreen = false;

/** Returns to the user's normal screen with the cursor shown; does nothing if the alternate screen isn't active. */
export function leaveAltScreen(): Promise<void> {
  if (!inAltScreen) return Promise.resolve();
  inAltScreen = false;
  // Erased first so that no frame survives even in a terminal that ignores the alternate screen. The promise settles once
  // the terminal has been handed the sequence, so what the caller prints next cannot be overtaken by it.
  return new Promise((resolve) => {
    process.stdout.write(MOUSE_OFF + ERASE_SCREEN + SHOW_CURSOR + EXIT_ALT_SCREEN, () => resolve());
  });
}

/**
 * Switches the terminal into its alternate screen buffer, so Cortex behaves like a full-screen
 * TUI (vim, htop) rather than appending to normal scrollback. Called by the entry point before
 * Ink draws anything: entered later (say from an effect), the first frame would land on the
 * user's normal screen and still be there after quitting.
 *
 * The original screen and cursor come back through `leaveAltScreen` once Ink has finished
 * (Ink draws a last frame as it unmounts, which is discarded with the alternate screen), and
 * on process signals, so a crash or Ctrl+C never leaves the terminal in the alternate buffer.
 */
export function enterAltScreen(): void {
  if (inAltScreen) return;
  inAltScreen = true;
  process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR + MOUSE_ON);

  const restore = () => void leaveAltScreen();
  process.once("exit", restore);
  process.once("SIGINT", restore);
  process.once("SIGTERM", restore);
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
