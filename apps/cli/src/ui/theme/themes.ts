/**
 * The colour themes, as semantic tokens: components ask for "the error colour" or "the added-line
 * background", never for a hex value, so a theme is a complete restyle and nothing else changes.
 * `undefined` means "the terminal's own default", which is what the mono theme uses throughout.
 */

export const THEME_NAMES = ["dark", "light", "mono"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface Theme {
  name: ThemeName;
  text: {
    /** Body text; undefined keeps the terminal's foreground. */
    primary: string | undefined;
    /** Hints, notices, line numbers. */
    secondary: string | undefined;
    /** Prompts, spinners, headings. */
    accent: string | undefined;
    link: string | undefined;
  };
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
  border: {
    default: string | undefined;
    focus: string | undefined;
  };
  /** Code colours, one per scope the highlighter reports (see format/highlight.ts). */
  syntax: Record<"keyword" | "string" | "number" | "comment" | "title" | "type" | "builtin", string | undefined>;
  /** Colour stops for the logo, left to right; empty means a single flat colour. */
  gradient: string[];
}

const dark: Theme = {
  name: "dark",
  text: { primary: undefined, secondary: "#8B93A7", accent: "#749BFF", link: "#6CB6FF" },
  status: { success: "#00B95C", warning: "#FBBC04", error: "#FC413D" },
  diff: { added: "#0F3D26", removed: "#4A1C1D" },
  border: { default: "#3B4256", focus: "#749BFF" },
  syntax: { keyword: "#B794F6", string: "#5FD38D", number: "#F5C451", comment: "#6B7385", title: "#6CA7FF", type: "#4DD0C8", builtin: "#FF9F6B" },
  // The logo's own two ends, sampled from the image: neon green fading to cyan. The emblem and the
  // wordmark both read their colours from this.
  gradient: ["#30F679", "#1FF6EC"],
};

const light: Theme = {
  name: "light",
  text: { primary: undefined, secondary: "#5F6778", accent: "#1A5FD1", link: "#0B5CAD" },
  status: { success: "#0B8A4B", warning: "#9A6A00", error: "#C5221F" },
  diff: { added: "#D3F0DF", removed: "#FAD7D5" },
  border: { default: "#B6BCCB", focus: "#1A5FD1" },
  syntax: { keyword: "#7A3FD0", string: "#0B7A43", number: "#A15C00", comment: "#6A7283", title: "#1257B8", type: "#0A7C74", builtin: "#B4531A" },
  // The same two ends, deepened so they stay readable on a light background.
  gradient: ["#0E9F4F", "#0891A8"],
};

const mono: Theme = {
  name: "mono",
  text: { primary: undefined, secondary: undefined, accent: undefined, link: undefined },
  status: { success: undefined, warning: undefined, error: undefined },
  diff: { added: undefined, removed: undefined },
  border: { default: undefined, focus: undefined },
  syntax: { keyword: undefined, string: undefined, number: undefined, comment: undefined, title: undefined, type: undefined, builtin: undefined },
  gradient: [],
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
