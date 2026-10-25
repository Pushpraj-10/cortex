import { describe, expect, it } from "vitest";
import { gradientAt, gradientColors, lerpHex } from "../../../src/ui/theme/gradient.js";

describe("lerpHex", () => {
  it("returns the endpoints at 0 and 1 and the midpoint at 0.5", () => {
    expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps an amount outside 0..1", () => {
    expect(lerpHex("#102030", "#405060", -3)).toBe("#102030");
    expect(lerpHex("#102030", "#405060", 9)).toBe("#405060");
  });

  it("blends each channel independently", () => {
    expect(lerpHex("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });

  it("leaves the start colour alone when either side is not #rrggbb", () => {
    expect(lerpHex("red", "#ffffff", 0.5)).toBe("red");
    expect(lerpHex("#ffffff", "nope", 0.5)).toBe("#ffffff");
  });
});

describe("gradientAt", () => {
  it("is undefined without stops and the stop itself with one", () => {
    expect(gradientAt([], 0.5)).toBeUndefined();
    expect(gradientAt(["#123456"], 0.9)).toBe("#123456");
  });

  it("walks evenly across several stops", () => {
    const stops = ["#000000", "#ff0000", "#0000ff"];
    expect(gradientAt(stops, 0)).toBe("#000000");
    expect(gradientAt(stops, 0.5)).toBe("#ff0000");
    expect(gradientAt(stops, 1)).toBe("#0000ff");
    expect(gradientAt(stops, 0.25)).toBe("#800000");
  });

  it("clamps a position outside 0..1", () => {
    expect(gradientAt(["#000000", "#ffffff"], -1)).toBe("#000000");
    expect(gradientAt(["#000000", "#ffffff"], 2)).toBe("#ffffff");
  });
});

describe("gradientColors", () => {
  it("spreads the stops over the columns, first to last", () => {
    expect(gradientColors(["#000000", "#ffffff"], 3)).toEqual(["#000000", "#808080", "#ffffff"]);
  });

  it("gives a single column the first stop", () => {
    expect(gradientColors(["#112233", "#ffffff"], 1)).toEqual(["#112233"]);
  });

  it("is empty with no stops or no columns", () => {
    expect(gradientColors([], 5)).toEqual([]);
    expect(gradientColors(["#000000", "#ffffff"], 0)).toEqual([]);
  });
});
