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
  /** Colour stops for the logo, left to right; empty means a single flat colour. */
  gradient: string[];
}

const dark: Theme = {
  name: "dark",
  text: { primary: undefined, secondary: "#6B7280", accent: "#D4A05F", link: "#7DB3E8" },
  status: { success: "#8CC084", warning: "#E5C07B", error: "#F87171" },
  diff: { added: "#1F3A2A", removed: "#4A2327" },
  border: { default: "#4B5563", focus: "#D4A05F" },
  gradient: ["#F4C97B", "#D4A05F", "#C8664F"],
};

const light: Theme = {
  name: "light",
  text: { primary: undefined, secondary: "#6B7280", accent: "#9A5B13", link: "#1D5FA8" },
  status: { success: "#2E7D32", warning: "#9A6700", error: "#C62828" },
  diff: { added: "#D5F0DC", removed: "#F9D7D7" },
  border: { default: "#9CA3AF", focus: "#9A5B13" },
  gradient: ["#B9741C", "#9A5B13", "#8F3F2B"],
};

const mono: Theme = {
  name: "mono",
  text: { primary: undefined, secondary: undefined, accent: undefined, link: undefined },
  status: { success: undefined, warning: undefined, error: undefined },
  diff: { added: undefined, removed: undefined },
  border: { default: undefined, focus: undefined },
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
