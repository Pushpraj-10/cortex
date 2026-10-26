/**
 * The note printed once the full-screen UI has closed and the shell is back, so quitting
 * leaves something friendly rather than nothing. Colours are the default theme's, and are
 * left out when the output isn't a colour terminal.
 */
export const REPO_URL = "https://github.com/Pushpraj-10/cortex";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const rgb = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
const RED = rgb(0xf8, 0x33, 0x3c);
const WHITE = rgb(0xe8, 0xe8, 0xe8);
const MUTED = rgb(0x8c, 0x8c, 0x8c);

/** Whether to colour: only a real terminal, and never when NO_COLOR asks otherwise. */
export function wantsColor(env: NodeJS.ProcessEnv = process.env, isTTY: boolean = process.stdout.isTTY === true): boolean {
  return isTTY && !("NO_COLOR" in env) && env.TERM !== "dumb";
}

export function farewell(color: boolean = wantsColor()): string {
  const paint = (style: string, text: string) => (color ? `${style}${text}${RESET}` : text);
  return [
    `  ${paint(RED, "✦")} ${paint(BOLD + WHITE, "Thanks for using Cortex!")}`,
    `    ${paint(MUTED, "If it helped, a")} ${paint(RED, "★")} ${paint(MUTED, "on GitHub goes a long way:")}`,
    `    ${paint(RED, REPO_URL)}`,
  ].join("\n");
}
