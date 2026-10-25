import { describe, expect, it } from "vitest";
import { THEME_NAMES, getTheme, isThemeName, resolveThemeName } from "../../../src/ui/theme/themes.js";

const HEX = /^#[0-9a-f]{6}$/i;

function tokenValues(name: (typeof THEME_NAMES)[number]): (string | undefined)[] {
  const theme = getTheme(name);
  return [
    ...Object.values(theme.text),
    ...Object.values(theme.status),
    ...Object.values(theme.diff),
    ...Object.values(theme.border),
    ...Object.values(theme.syntax),
  ];
}

describe("themes", () => {
  it("offers dark, light and mono, each returning itself by name", () => {
    expect([...THEME_NAMES]).toEqual(["dark", "light", "mono"]);
    for (const name of THEME_NAMES) expect(getTheme(name).name).toBe(name);
  });

  it("uses real #rrggbb colours wherever dark and light set one, and a gradient of at least two stops", () => {
    for (const name of ["dark", "light"] as const) {
      for (const value of tokenValues(name)) if (value !== undefined) expect(value).toMatch(HEX);
      expect(getTheme(name).gradient.length).toBeGreaterThanOrEqual(2);
      for (const stop of getTheme(name).gradient) expect(stop).toMatch(HEX);
    }
  });

  it("sets no colour at all in mono", () => {
    expect(tokenValues("mono").every((value) => value === undefined)).toBe(true);
    expect(getTheme("mono").gradient).toEqual([]);
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
