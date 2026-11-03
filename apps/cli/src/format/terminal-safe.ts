/**
 * Text from somewhere Cortex does not control (a command's output, a file's contents, a model's reply, a server's error message)
 * made safe to print in the user's terminal. A terminal obeys more than letters: an escape sequence can clear the screen and
 * redraw something else, set the window title, write to the clipboard (OSC 52) or hide text, and a carriage return can overwrite
 * the start of a line. In the approval window that would let a command read differently from what runs.
 *
 * What is removed: operating-system and device-control strings (title, clipboard, hyperlinks), cursor and screen control, and
 * every other escape sequence. What is kept is text, newlines, tabs and, when asked, colour (SGR) sequences, which cannot
 * move anything. Any other control character is written out as `\u00XX`, so it can be seen instead of silently disappearing.
 */

/**
 * Every escape sequence, matched in one left-to-right pass so that each ESC begins exactly one of these and nothing is
 * stitched together afterwards. In order of how much they take: an operating system command (window title, clipboard,
 * hyperlinks; ends at BEL or ESC \, and an unterminated one runs to the end of the text), a device-control, application
 * command, privacy or start-of-string sequence (the same shape), a control sequence (cursor movement, erasing, modes, and
 * SGR colour, which ends in `m`), and last, an ESC and the one character after it (`ESC c` resets the terminal) or a lone
 * ESC at the end, without swallowing a newline.
 */
const ESCAPE_SEQUENCE = new RegExp(
  [
    "\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\|$)",
    "\\u001b[P_^X][^\\u001b]*(?:\\u001b\\\\|$)",
    "\\u001b\\[[0-?]*[ -/]*[@-~]",
    "\\u001b[^\\n]?",
  ].join("|"),
  "g",
);
const COLOUR_ONLY = /^\u001b\[[0-9;:]*m$/;
/** C0 controls other than tab, newline and ESC (every ESC left by now begins a colour sequence that was kept), DEL, the C1 controls, and the characters that reorder or hide text. */
const OTHER_CONTROLS = /[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/g;

export function safeText(text: string, options: { colour?: boolean } = {}): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(ESCAPE_SEQUENCE, (sequence) => (options.colour && COLOUR_ONLY.test(sequence) ? sequence : ""))
    .replace(OTHER_CONTROLS, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
