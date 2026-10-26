/**
 * The colour themes, as semantic tokens: components ask for "the primary colour" or "the added-line
 * background", never for a hex value, so a theme is a complete restyle and nothing else changes.
 * `undefined` means "the terminal's own default", which is what the mono theme uses throughout.
 *
 * The palette follows the logo: its red as the brand colour, its off-white as the supporting colour, and
 * neutral greys between. Errors are a lighter, pinker red than the brand so they never read as ordinary
 * chrome; success and warning stay muted green and amber. Syntax colours are drawn from the same few hues,
 * so code, prose and chrome read as one design.
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
  /** The full-width background of the menus and prompts drawn over the transcript, which have no border. */
  panelBackground: string | undefined;
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
  primary: "#F8333C", // the logo's red
  secondary: "#E8E8E8", // the logo's off-white
  muted: "#8C8C8C",
  border: "#3D3D3D",
  inputBackground: "#161616",
  panelBackground: "#000000",
  status: { success: "#8FC79A", warning: "#D9B77E", error: "#FF7A85" },
  diff: { added: "#16281C", removed: "#3A1A1E" },
  syntax: { keyword: "#FF5A63", string: "#8FC79A", number: "#D9B77E", comment: "#858585", title: "#F5F5F5", type: "#8FC79A", builtin: "#D9B77E" },
};

const light: Theme = {
  name: "light",
  primary: "#D4101A",
  secondary: "#2B2B2B",
  muted: "#5F5F5F",
  border: "#D6D6D6",
  inputBackground: "#F3F3F3",
  panelBackground: "#F2F2F2",
  status: { success: "#3F7A4A", warning: "#7B6637", error: "#A3182A" },
  diff: { added: "#DDEBDD", removed: "#F5DCDE" },
  syntax: { keyword: "#C4101A", string: "#3F7A4A", number: "#7B6637", comment: "#6B6B6B", title: "#1F1F1F", type: "#3F7A4A", builtin: "#7B6637" },
};

const mono: Theme = {
  name: "mono",
  primary: undefined,
  secondary: undefined,
  muted: undefined,
  border: undefined,
  inputBackground: undefined,
  panelBackground: undefined,
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
