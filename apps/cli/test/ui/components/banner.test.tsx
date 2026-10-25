import React from "react";
import { describe, expect, it } from "vitest";
import { Banner } from "../../../src/ui/components/Banner.js";
import { displayWidth } from "../../../src/format/table.js";
import { renderFrame } from "../support/render-frame.js";

const header = (columns: number, rows: number) => renderFrame(<Banner cwd={"D:\\proj\\demo"} version="1.2.3" />, columns, rows);
const hasEmblem = (frame: string) => /[\u2801-\u28ff]/.test(frame);

describe("Banner", () => {
  it("shows the large emblem beside the wordmark and the details on a big terminal", async () => {
    const frame = await header(100, 40);
    expect(hasEmblem(frame)).toBe(true);
    expect(frame).toContain("▄▀▀▀▄"); // the C of the wordmark
    expect(frame).toContain("v1.2.3");
    expect(frame).toContain("D:\\proj\\demo");
    expect(frame).toContain("Tip:");
    expect(frame.split("\n").filter((line) => hasEmblem(line)).length).toBeGreaterThanOrEqual(12);
  });

  it("shows the smaller emblem on a standard 80x24 terminal, with the details underneath", async () => {
    const frame = await header(80, 24);
    expect(hasEmblem(frame)).toBe(true);
    const emblemRows = frame.split("\n").filter((line) => hasEmblem(line)).length;
    expect(emblemRows).toBeLessThanOrEqual(7);
    expect(frame).toContain("v1.2.3");
  });

  it("is the wordmark alone, without the emblem, when the terminal is too small", async () => {
    const frame = await header(30, 18);
    expect(hasEmblem(frame)).toBe(false);
    expect(frame).toContain("C O R T E X");
    expect(frame).toContain("v1.2.3");
  });

  it("never draws a line wider than the terminal", async () => {
    for (const [columns, rows] of [
      [100, 40],
      [80, 24],
      [60, 24],
      [40, 18],
      [30, 18],
    ] as const) {
      const frame = await header(columns, rows);
      for (const line of frame.split("\n")) expect(displayWidth(line)).toBeLessThanOrEqual(columns);
    }
  });
});
