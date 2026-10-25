/**
 * The colour themes, as semantic tokens: components ask for "the primary colour" or "the added-line
 * background", never for a hex value, so a theme is a complete restyle and nothing else changes.
 * `undefined` means "the terminal's own default", which is what the mono theme uses throughout.
 *
 * The palette is deliberately quiet: two soft brand colours (a dusty blue and a sage green), neutral
 * greys, and muted amber and rose for warnings and errors. Nothing is saturated enough to glow. Syntax
 * colours are drawn from the same few hues, so code, prose and chrome read as one design.
 */

export const THEME_NAMES = ["dark", "light", "mono"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface Theme {
  name: ThemeName;
  /** The brand colour: the logo, headings, prompts, the focused border, list markers, the selected item. */
  primary: string | undefined;
  /** The supporting colour: links, code, the model name. */
  secondary: string | undefined;
  /** Neutral grey for hints, notices, line numbers and the rules around the input box. */
  muted: string | undefined;
  /** Neutral for idle borders and rules inside content. */
  border: string | undefined;
  /** A slightly lifted background behind the input box, so it reads as a field. */
  inputBackground: string | undefined;
  status: {
    success: string | undefined;
    warning: string | undefined;
    error: string | undefined;
  };
  /** Background colours behind added and removed lines of a diff. */
  diff: {
    added: string | undefined;
    removed: string | undefined;
  };
  /** Code colours, one per scope the highlighter reports (see format/highlight.ts). */
  syntax: Record<"keyword" | "string" | "number" | "comment" | "title" | "type" | "builtin", string | undefined>;
}

const dark: Theme = {
  name: "dark",
  primary: "#9DB7D5", // dusty blue
  secondary: "#A8C3A0", // sage
  muted: "#8B93A1",
  border: "#4A5160",
  inputBackground: "#171B21",
  status: { success: "#A8C3A0", warning: "#D9B77E", error: "#D98A8F" },
  diff: { added: "#1F2E26", removed: "#35252A" },
  syntax: { keyword: "#9DB7D5", string: "#A8C3A0", number: "#D9B77E", comment: "#7C8798", title: "#B8CCE4", type: "#A8C3A0", builtin: "#D9B77E" },
};

const light: Theme = {
  name: "light",
  primary: "#3F6E94",
  secondary: "#4D7A4F",
  muted: "#5C6370",
  border: "#C9CFDA",
  inputBackground: "#F1F3F5",
  status: { success: "#4D7A4F", warning: "#7B6637", error: "#B03A48" },
  diff: { added: "#DDEBDD", removed: "#F3DDDF" },
  syntax: { keyword: "#3F6E94", string: "#4D7A4F", number: "#7B6637", comment: "#6B7280", title: "#2F5F87", type: "#4D7A4F", builtin: "#7B6637" },
};

const mono: Theme = {
  name: "mono",
  primary: undefined,
  secondary: undefined,
  muted: undefined,
  border: undefined,
  inputBackground: undefined,
  status: { success: undefined, warning: undefined, error: undefined },
  diff: { added: undefined, removed: undefined },
  syntax: { keyword: undefined, string: undefined, number: undefined, comment: undefined, title: undefined, type: undefined, builtin: undefined },
};

const THEMES: Record<ThemeName, Theme> = { dark, light, mono };

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

export function getTheme(name: ThemeName): Theme {
  return THEMES[name];
}

/**
 * The theme to show: `NO_COLOR` (any non-empty value, per no-color.org) always wins and gives mono;
 * otherwise the requested name if it is a real theme, else dark.
 */
export function resolveThemeName(requested: string | undefined, env: NodeJS.ProcessEnv = process.env): ThemeName {
  if ((env.NO_COLOR ?? "") !== "") return "mono";
  return isThemeName(requested) ? requested : "dark";
}
