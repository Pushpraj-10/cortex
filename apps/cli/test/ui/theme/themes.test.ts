import { describe, expect, it } from "vitest";
import { THEME_NAMES, getTheme, isThemeName, resolveThemeName, type Theme } from "../../../src/ui/theme/themes.js";

const HEX = /^#[0-9a-f]{6}$/i;

/** Every colour a theme sets, flattened. */
function colours(theme: Theme): (string | undefined)[] {
  return [
    theme.primary,
    theme.secondary,
    theme.muted,
    theme.border,
    theme.inputBackground,
    ...Object.values(theme.status),
    ...Object.values(theme.diff),
    ...Object.values(theme.syntax),
  ];
}

/** HSL saturation, 0 to 1: how far a colour is from grey. */
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
}

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high! + 0.05) / (low! + 0.05);
}

describe("themes", () => {
  it("offers dark, light and mono, each returning itself by name", () => {
    expect([...THEME_NAMES]).toEqual(["dark", "light", "mono"]);
    for (const name of THEME_NAMES) expect(getTheme(name).name).toBe(name);
  });

  it("uses real #rrggbb colours wherever dark and light set one, and sets all of them", () => {
    for (const name of ["dark", "light"] as const) {
      for (const value of colours(getTheme(name))) expect(value).toMatch(HEX);
    }
  });

  it("has two distinct brand colours, and keeps red for errors only", () => {
    for (const name of ["dark", "light"] as const) {
      const theme = getTheme(name);
      expect(theme.primary).not.toBe(theme.secondary);
      expect(theme.status.error).not.toBe(theme.primary);
      expect(theme.status.error).not.toBe(theme.secondary);
    }
  });

  it("keeps every coloured token soft: nothing is saturated enough to glow", () => {
    for (const name of ["dark", "light"] as const) {
      const theme = getTheme(name);
      for (const [label, colour] of Object.entries({ primary: theme.primary, secondary: theme.secondary, ...theme.status, ...theme.syntax })) {
        expect(saturation(colour as string), `${name} ${label} ${colour}`).toBeLessThan(0.6);
      }
      expect(saturation(theme.primary as string)).toBeLessThan(0.5);
      expect(saturation(theme.secondary as string)).toBeLessThan(0.5);
    }
  });

  it("has no gradient: the logo is one colour", () => {
    expect(Object.keys(getTheme("dark"))).not.toContain("gradient");
  });

  it("keeps all text colours readable (WCAG AA, 4.5:1) on a typical dark and light background", () => {
    const text = (theme: Theme) => [theme.primary, theme.secondary, theme.muted, ...Object.values(theme.status), ...Object.values(theme.syntax)] as string[];
    for (const colour of text(getTheme("dark"))) expect(contrast(colour, "#0D1117")).toBeGreaterThanOrEqual(4.5);
    for (const colour of text(getTheme("light"))) expect(contrast(colour, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("gives added and removed diff lines different backgrounds", () => {
    for (const name of ["dark", "light"] as const) {
      const { diff } = getTheme(name);
      expect(diff.added).not.toBe(diff.removed);
    }
  });

  it("sets no colour at all in mono", () => {
    expect(colours(getTheme("mono")).every((value) => value === undefined)).toBe(true);
  });

  it("recognises only real theme names", () => {
    expect(isThemeName("light")).toBe(true);
    expect(isThemeName("neon")).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
    expect(isThemeName(3)).toBe(false);
  });
});

describe("resolveThemeName", () => {
  it("uses the requested theme, and dark when none or an unknown one is requested", () => {
    expect(resolveThemeName("light", {})).toBe("light");
    expect(resolveThemeName(undefined, {})).toBe("dark");
    expect(resolveThemeName("neon", {})).toBe("dark");
  });

  it("forces mono whenever NO_COLOR is set to anything non-empty", () => {
    expect(resolveThemeName("light", { NO_COLOR: "1" })).toBe("mono");
    expect(resolveThemeName(undefined, { NO_COLOR: "yes" })).toBe("mono");
  });

  it("ignores an empty NO_COLOR", () => {
    expect(resolveThemeName("light", { NO_COLOR: "" })).toBe("light");
  });
});
