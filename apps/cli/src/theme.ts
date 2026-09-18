/**
 * Single source of truth for Cortex's visual identity. Every component imports
 * colors and copy from here rather than hardcoding them, so retheming is a
 * one-file change.
 */

export const colors = {
  /** Prompts, spinners, borders, highlights. */
  accent: "#D4A05F",
  /** Secondary/meta text: token counts, hints, timestamps. */
  muted: "#6B7280",
  /** Errors. */
  error: "#F87171",
  /** Success state and added diff lines. */
  success: "#4ADE80",
  /** Removed diff lines — distinct from `error` even though both are red-family. */
  removed: "#B45454",
} as const;

export const tagline = "AI coding agent, right in your terminal.";

/** Block-letter wordmark, rendered as-is inside a bordered box on startup. */
export const bannerArt = [
  " ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗",
  "██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝",
  "██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝ ",
  "╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗",
  " ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝",
];

export const placeholder = "Try 'fix the bug in...' or press ? for help";

export const statusHint = "? for shortcuts · esc to interrupt";

/** Verbs the thinking indicator cycles through while a request is in flight. */
export const thinkingVerbs = ["Thinking", "Pondering", "Working", "Reasoning", "Mulling"];

/** How often (ms) the thinking indicator rotates to the next verb. */
export const thinkingVerbRotationMs = 3000;

/** Max visible rows for the growing multi-line input box before it clips internally. */
export const maxInputBoxLines = 10;
