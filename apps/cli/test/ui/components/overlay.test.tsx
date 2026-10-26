import React from "react";
import { Box, Text } from "ink";
import { describe, expect, it } from "vitest";
import { Overlay } from "../../../src/ui/components/Overlay.js";
import { renderFrame } from "../support/render-frame.js";

const WIDTH = 30;
const ROWS = 10;
const TRANSCRIPT_ROWS = 6;

/** A screen like the app's: a transcript of full rows, the spot the overlay sits at, then the input and the status. */
function screen(overlay?: React.ReactNode) {
  return (
    <Box flexDirection="column" height={ROWS}>
      <Box flexDirection="column" height={TRANSCRIPT_ROWS}>
        {Array.from({ length: TRANSCRIPT_ROWS }, (_, i) => (
          <Text key={i}>{`message ${i} `.padEnd(WIDTH, "x")}</Text>
        ))}
      </Box>
      {overlay}
      <Text>INPUT</Text>
      <Text>STATUS</Text>
    </Box>
  );
}

const menu = (
  <Box flexDirection="column" borderStyle="round" paddingX={1}>
    <Text>› /help</Text>
    <Text>  /clear</Text>
  </Box>
);

describe("Overlay", () => {
  it("draws over the bottom of the transcript without moving anything", async () => {
    const without = (await renderFrame(screen(), WIDTH, ROWS)).split("\n");
    const withMenu = (await renderFrame(screen(<Overlay rows={4}>{menu}</Overlay>), WIDTH, ROWS)).split("\n");

    // The transcript above the overlay, and the input and status line below it, are exactly where they were.
    expect(withMenu.slice(0, TRANSCRIPT_ROWS - 4)).toEqual(without.slice(0, TRANSCRIPT_ROWS - 4));
    expect(withMenu.slice(TRANSCRIPT_ROWS)).toEqual(without.slice(TRANSCRIPT_ROWS));
    expect(withMenu).toHaveLength(without.length);
  });

  it("sits directly above the input, covering the last transcript rows", async () => {
    const lines = (await renderFrame(screen(<Overlay rows={4}>{menu}</Overlay>), WIDTH, ROWS)).split("\n");
    expect(lines[2]).toMatch(/^╭─+╮$/);
    expect(lines[3]).toContain("› /help");
    expect(lines[4]).toContain("  /clear");
    expect(lines[5]).toMatch(/^╰─+╯$/);
    expect(lines[6]).toBe("INPUT");
  });

  it("lets none of the transcript show through the covered rows", async () => {
    const lines = (await renderFrame(screen(<Overlay rows={4}>{menu}</Overlay>), WIDTH, ROWS)).split("\n");
    for (const line of lines.slice(2, 6)) expect(line).not.toContain("message");
    for (const line of lines.slice(2, 6)) expect(line).not.toContain("x");
    expect(lines[0]).toContain("message 0");
    expect(lines[1]).toContain("message 1");
  });

  it("draws nothing for zero rows", async () => {
    const without = await renderFrame(screen(), WIDTH, ROWS);
    expect(await renderFrame(screen(<Overlay rows={0}>{menu}</Overlay>), WIDTH, ROWS)).toBe(without);
  });

  it("puts a miscount at the top of the overlay, never over the input box", async () => {
    // The menu is 4 rows tall but the overlay was told 6.
    const lines = (await renderFrame(screen(<Overlay rows={6}>{menu}</Overlay>), WIDTH, ROWS)).split("\n");
    expect(lines[6]).toBe("INPUT");
    expect(lines[7]).toBe("STATUS");
    expect(lines[5]).toMatch(/^╰─+╯$/);
  });
});
