/** Renders an Ink element into a fake terminal and returns what it drew as plain text, for component tests. */
import type React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

export async function renderFrame(element: React.ReactElement, columns = 80, rows = 40): Promise<string> {
  const stdout = new PassThrough() as PassThrough & { columns: number; rows: number; isTTY: boolean };
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = false;

  const writes: string[] = [];
  stdout.on("data", (chunk) => writes.push(chunk.toString()));

  // debug mode writes each complete frame as it is rendered, with no cursor movement, so the last write is the screen.
  const app = render(element, { stdout: stdout as unknown as NodeJS.WriteStream, debug: true, patchConsole: false, exitOnCtrlC: false });
  await new Promise((resolve) => setTimeout(resolve, 30));
  app.unmount();

  return (writes[writes.length - 1] ?? "").replace(ANSI, "").replace(/\n+$/, "");
}
