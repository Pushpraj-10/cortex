/**
 * Colour gradients for the logo, as pure functions on `#rrggbb` strings (no dependency): blend two
 * colours, pick a point along several stops, or spread the stops over a number of columns.
 */

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const value = parseInt(match[1]!, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** Blends `from` towards `to`; `amount` is clamped to 0..1. Anything that is not `#rrggbb` returns `from` unchanged. */
export function lerpHex(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, amount));
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

/** The colour at position `t` (0..1) along evenly spaced stops; undefined when there are no stops. */
export function gradientAt(stops: readonly string[], t: number): string | undefined {
  if (stops.length === 0) return undefined;
  if (stops.length === 1) return stops[0];
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return lerpHex(stops[index]!, stops[index + 1]!, scaled - index);
}

/** One colour per column, the first column at the first stop and the last at the last. Empty without stops. */
export function gradientColors(stops: readonly string[], count: number): string[] {
  if (stops.length === 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, column) => gradientAt(stops, count === 1 ? 0 : column / (count - 1))!);
}
