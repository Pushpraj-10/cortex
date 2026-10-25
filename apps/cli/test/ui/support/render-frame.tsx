/** Renders Ink elements into a fake terminal, for component and hook tests. */
import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { TerminalSizeContext } from "../../../src/ui/hooks/terminal.js";

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** A stand-in for a terminal of the given size. `writes` collects everything Ink prints to it. */
function fakeTerminal(columns: number, rows: number) {
  const stdout = new PassThrough() as PassThrough & { columns: number; rows: number; isTTY: boolean };
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = false;
  const writes: string[] = [];
  stdout.on("data", (chunk) => writes.push(chunk.toString()));
  // debug mode writes each complete frame as it is rendered, with no cursor movement, so the last write is the screen.
  const options = { stdout: stdout as unknown as NodeJS.WriteStream, debug: true, patchConsole: false, exitOnCtrlC: false };
  return { writes, options };
}

/**
 * Puts `element` where the real app puts everything: under one shared terminal size. Without it every component that reads
 * the size would listen for resizes itself, and a transcript of twenty messages would trip Node's ten-listener warning.
 */
const underSharedSize = (element: React.ReactElement, columns: number, rows: number) =>
  React.createElement(TerminalSizeContext.Provider, { value: { columns, rows } }, element);

/** Renders `element` once and returns what it drew as plain text. */
export async function renderFrame(element: React.ReactElement, columns = 80, rows = 40): Promise<string> {
  const { writes, options } = fakeTerminal(columns, rows);
  const app = render(underSharedSize(element, columns, rows), options);
  await new Promise((resolve) => setTimeout(resolve, 30));
  app.unmount();

  return (writes[writes.length - 1] ?? "").replace(ANSI, "").replace(/\n+$/, "");
}

/** Mounts `element` and keeps it live, for driving a hook from a test. Call `unmount()` when done. */
export function mountElement(element: React.ReactElement, columns = 80, rows = 40): { unmount(): void } {
  const app = render(underSharedSize(element, columns, rows), fakeTerminal(columns, rows).options);
  return { unmount: () => app.unmount() };
}

/** Lets React apply pending state updates. */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 25));
