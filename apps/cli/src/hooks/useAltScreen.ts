import { useEffect } from "react";

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
