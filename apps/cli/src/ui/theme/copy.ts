/** The words the UI shows (taglines, hints, tips) and its fixed sizes, in one place next to the colours. */

export const tagline = "AI coding agent, right in your terminal.";

/** Example prompts, shown dimmed in an empty input box as `Try "..."`. */
export const placeholderExamples = ["how does <filepath> work?", "fix lint errors", "write a test for <filepath>", "refactor <filepath>", "edit <filepath> to..."];

/** One example, chosen with `random` (0 <= n < 1) so tests can pin the choice. */
export function pickPlaceholder(random: () => number = Math.random): string {
  const example = placeholderExamples[Math.min(placeholderExamples.length - 1, Math.floor(random() * placeholderExamples.length))]!;
  return `Try "${example}"`;
}

/** The footer's hint; pressing `?` in an empty input shows the shortcuts. */
export const shortcutsHint = "? for shortcuts";

/** Verbs the thinking indicator cycles through while a request is in flight. */
export const thinkingVerbs = ["Thinking", "Pondering", "Working", "Reasoning", "Mulling"];

/** How often (ms) the thinking indicator rotates to the next verb. */
export const thinkingVerbRotationMs = 3000;

/** Max visible rows for the growing multi-line input box before it clips internally. */
export const maxInputBoxLines = 10;

/** One-line tips under the logo; each must stay true of a real feature. */
export const tips = [
  "Type / to see every command, or /help for the keys.",
  "Press shift+tab to cycle the permission mode.",
  "Name a file in your message (fix src/parser.ts) and Cortex reads it with its imports and tests.",
  "Press ctrl+t to expand the last tool call.",
  "Use /provider to switch between Ollama, Google and Anthropic without restarting.",
  "Press esc to interrupt a running request.",
  "Use /theme to switch between dark, light and mono.",
];

/** A tip chosen with `random` (0 <= n < 1), so tests can pin the choice. */
export function pickTip(random: () => number = Math.random): string {
  return tips[Math.min(tips.length - 1, Math.floor(random() * tips.length))]!;
}
