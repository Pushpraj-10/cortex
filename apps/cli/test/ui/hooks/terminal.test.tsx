import React from "react";
import { PassThrough } from "node:stream";
import { render } from "ink";
import { describe, expect, it } from "vitest";
import { TerminalSizeContext, useTerminalSize } from "../../../src/ui/hooks/terminal.js";
import { settle } from "../support/render-frame.js";

type FakeStdout = PassThrough & { columns: number; rows: number; isTTY: boolean };

function fakeStdout(columns: number, rows: number): FakeStdout {
  const stdout = new PassThrough() as FakeStdout;
  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = false;
  return stdout;
}

/** Renders `element` on a fake terminal and returns the terminal and a way to stop. */
function mount(element: React.ReactElement, stdout: FakeStdout) {
  const app = render(element, { stdout: stdout as unknown as NodeJS.WriteStream, debug: true, patchConsole: false, exitOnCtrlC: false });
  return { unmount: () => app.unmount() };
}

/** How many `resize` listeners Ink puts on a terminal for itself, so the tests count only what the hook adds. */
async function inkOwnListeners(): Promise<number> {
  const stdout = fakeStdout(80, 24);
  const { unmount } = mount(<></>, stdout);
  await settle();
  const count = stdout.listenerCount("resize");
  unmount();
  return count;
}

/** Records the size each render of it saw. */
function Probe({ seen }: { seen: { columns: number; rows: number }[] }) {
  seen.push(useTerminalSize());
  return null;
}

describe("useTerminalSize", () => {
  it("reads the terminal's size", async () => {
    const seen: { columns: number; rows: number }[] = [];
    const stdout = fakeStdout(120, 30);
    const { unmount } = mount(<Probe seen={seen} />, stdout);
    await settle();
    expect(seen.at(-1)).toEqual({ columns: 120, rows: 30 });
    unmount();
  });

  it("follows a resize", async () => {
    const seen: { columns: number; rows: number }[] = [];
    const stdout = fakeStdout(120, 30);
    const { unmount } = mount(<Probe seen={seen} />, stdout);
    await settle();

    stdout.columns = 60;
    stdout.rows = 20;
    stdout.emit("resize");
    await settle();

    expect(seen.at(-1)).toEqual({ columns: 60, rows: 20 });
    unmount();
  });

  it("listens for resizes itself when it has no shared size, and lets go when unmounted", async () => {
    const stdout = fakeStdout(100, 30);
    const seen: { columns: number; rows: number }[] = [];
    const { unmount } = mount(
      <>
        <Probe seen={seen} />
        <Probe seen={seen} />
        <Probe seen={seen} />
      </>,
      stdout,
    );
    await settle();
    const baseline = await inkOwnListeners();
    expect(stdout.listenerCount("resize")).toBe(baseline + 3);
    unmount();
    await settle();
    expect(stdout.listenerCount("resize")).toBe(0);
  });

  it("uses the shared size, and adds no listener of its own, inside a TerminalSizeContext", async () => {
    const stdout = fakeStdout(100, 30);
    const seen: { columns: number; rows: number }[] = [];
    const { unmount } = mount(
      <TerminalSizeContext.Provider value={{ columns: 50, rows: 12 }}>
        <Probe seen={seen} />
        <Probe seen={seen} />
        <Probe seen={seen} />
      </TerminalSizeContext.Provider>,
      stdout,
    );
    await settle();
    expect(stdout.listenerCount("resize")).toBe(await inkOwnListeners());
    expect(seen.at(-1)).toEqual({ columns: 50, rows: 12 });
    unmount();
  });
});
