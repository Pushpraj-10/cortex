/**
 * The colour themes, as semantic tokens: components ask for "the primary colour" or "the added-line
 * background", never for a hex value, so a theme is a complete restyle and nothing else changes.
 * `undefined` means "the terminal's own default", which is what the mono theme uses throughout.
 *
 * The palette is deliberately small: two brand colours (mint and sky), neutral greys, and amber and red
 * kept for warnings and errors. Syntax colours are drawn from the same few hues, so code, prose and chrome
 * read as one design rather than a rainbow.
 */

export const THEME_NAMES = ["dark", "light", "mono"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface Theme {
  name: ThemeName;
  /** The brand colour: the logo, headings, prompts, the focused border, list markers, the selected item. */
  primary: string | undefined;
  /** The supporting colour: links, code, the model name. */
  secondary: string | undefined;
  /** Neutral grey for hints, notices and line numbers. */
  muted: string | undefined;
  /** Neutral for idle borders and rules. */
  border: string | undefined;
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
  primary: "#3DDC97", // mint
  secondary: "#5BC0EB", // sky
  muted: "#7F8A9C",
  border: "#3A4252",
  status: { success: "#3DDC97", warning: "#E8B04A", error: "#F2677A" },
  diff: { added: "#12362A", removed: "#3E1D26" },
  syntax: { keyword: "#3DDC97", string: "#E8B04A", number: "#E8B04A", comment: "#76829A", title: "#5BC0EB", type: "#5BC0EB", builtin: "#3DDC97" },
};

const light: Theme = {
  name: "light",
  primary: "#087F55",
  secondary: "#0B74A6",
  muted: "#5B6577",
  border: "#C9CFDA",
  status: { success: "#087F55", warning: "#946200", error: "#C0344D" },
  diff: { added: "#D5F1E4", removed: "#F8D9DE" },
  syntax: { keyword: "#087F55", string: "#946200", number: "#946200", comment: "#6B7587", title: "#0B74A6", type: "#0B74A6", builtin: "#087F55" },
};

const mono: Theme = {
  name: "mono",
  primary: undefined,
  secondary: undefined,
  muted: undefined,
  border: undefined,
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
