import React from "react";
import { describe, expect, it, vi } from "vitest";
import { displayWidth } from "../../../src/format/table.js";
import { MessageBubble, MessageList, NoticeLine } from "../../../src/ui/components/Messages.js";
import { renderFrame } from "../support/render-frame.js";

const error = (content: string) => ({ kind: "message" as const, id: "m", role: "assistant" as const, content, isError: true });
const notice = (text: string) => ({ kind: "notice" as const, id: "n", text });
const lines = async (element: React.ReactElement, width = 40) => (await renderFrame(element, width)).split("\n");

describe("MessageBubble: errors", () => {
  it("marks a model failure with the same cross a failed tool call has", async () => {
    expect(await lines(<MessageBubble message={error("LLM request failed: boom")} />)).toEqual(["✗ LLM request failed: boom"]);
  });

  it("keeps every line of a long failure beside the cross's column, not under it", async () => {
    const rows = await lines(<MessageBubble message={error("LLM request failed: Google returned 503: " + "high demand ".repeat(6))} />, 30);
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]!.startsWith("✗ ")).toBe(true);
    for (const row of rows.slice(1)) expect(row.startsWith("  ")).toBe(true);
  });
});

describe("MessageList: a transcript taller than its viewport", () => {
  const conversation = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      kind: "message" as const,
      id: `m${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message number ${i}`,
    }));
  const draw = (count: number, height: number, extra: Partial<React.ComponentProps<typeof MessageList>> = {}, columns = 60) =>
    renderFrame(<MessageList cwd="D:\\proj" version="0" height={height} timeline={conversation(count)} expandedToolCallIds={new Set()} {...extra} />, columns);

  it("shows the newest messages, not the oldest, with the newest at the bottom", async () => {
    const rows = (await draw(20, 10)).split("\n");
    expect(rows.at(-1)).toBe("  message number 19"); // the blank margin row after it is trimmed from the frame
    expect(rows.join("\n")).not.toContain("message number 0\n");
  });

  it("keeps every message on its own row, with the blank row between messages, and nothing drawn over them", async () => {
    // Ten rows: five messages of two rows each (the last one's blank row is trimmed from the frame). Squeezed, it would
    // show the start of the conversation with the rows overlapping, and the banner's last row under the first message.
    expect((await draw(20, 10)).split("\n")).toEqual([
      "  message number 15",
      "",
      "> message number 16",
      "",
      "  message number 17",
      "",
      "> message number 18",
      "",
      "  message number 19",
    ]);
  });

  it("shows all of a short conversation, banner included, from the top", async () => {
    const frame = await draw(2, 40);
    expect(frame).toContain("v0");
    expect(frame).toContain("> message number 0");
    expect(frame).toContain("message number 1");
  });

  it("starts a short conversation on the first row, with the banner there rather than just above the input bar", async () => {
    const rows = (await draw(2, 40)).split("\n");
    expect(rows[0]!.trim()).not.toBe("");
    expect(rows.findIndex((row) => row.includes("v0"))).toBeLessThan(10);
  });
});

describe("MessageList: scrolling", () => {
  const conversation = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      kind: "message" as const,
      id: `m${i}`,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message number ${i}`,
    }));
  const draw = (height: number, scrollOffset: number, columns = 60, count = 20) =>
    renderFrame(
      <MessageList cwd="D:\\proj" version="0" height={height} timeline={conversation(count)} expandedToolCallIds={new Set()} scrollOffset={scrollOffset} />,
      columns,
    );

  /** What the transcript reported about itself after it was laid out with `count` messages. */
  async function reported(count: number, height = 10) {
    const calls: { contentHeight: number; viewportHeight: number }[] = [];
    await renderFrame(
      <MessageList
        cwd="D:\\proj"
        version="0"
        height={height}
        timeline={conversation(count)}
        expandedToolCallIds={new Set()}
        onMeasure={(contentHeight, viewportHeight) => calls.push({ contentHeight, viewportHeight })}
      />,
      60,
    );
    return calls.at(-1)!;
  }

  it("shows older messages when scrolled up, and a row saying how far", async () => {
    const rows = (await draw(10, 4)).split("\n");
    const screen = rows.join("\n");
    expect(rows).toHaveLength(10);
    expect(screen).toContain("message number 14");
    expect(screen).toContain("message number 17");
    expect(screen).not.toContain("message number 18");
    expect(screen).not.toContain("message number 19");
    expect(rows.at(-1)).toContain("↓ 4 rows below");
  });

  it("scrolls by exactly the rows asked for: four rows is two messages", async () => {
    const atBottom = await draw(10, 0);
    const scrolled = await draw(10, 4);
    expect(atBottom).toContain("message number 19");
    expect(scrolled.split("\n").filter((row) => row.includes("message number")).at(-1)).toContain("message number 17");
  });

  it("says '1 row' for one row, and shows no notice at the bottom", async () => {
    expect((await draw(10, 1)).split("\n").at(-1)).toContain("↓ 1 row below");
    expect(await draw(10, 0)).not.toContain("below");
  });

  it("is one row at every width, with the longest wording that fits", async () => {
    for (const width of [16, 24, 34, 50, 70, 100]) {
      const rows = (await draw(8, 6, width)).split("\n");
      expect(rows, `width ${width}`).toHaveLength(8);
      expect(displayWidth(rows.at(-1)!), `width ${width}`).toBeLessThanOrEqual(width);
    }
    expect((await draw(8, 6, 100)).split("\n").at(-1)).toContain("send a message to jump to the end");
    const medium = (await draw(8, 6, 50)).split("\n").at(-1)!;
    expect(medium).toContain("pagedown for newer");
    expect(medium).not.toContain("send a message");
    expect((await draw(8, 6, 20)).split("\n").at(-1)).toContain("↓ 6 rows below");
  });

  it("reports the transcript's full height, which grows by two rows per message (not squeezed to the viewport)", async () => {
    // The banner picks a random tip each time it is shown, and some wrap onto a second row; pin it so both renders have the same banner.
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const short = await reported(10);
      const long = await reported(20);
      expect(long.contentHeight - short.contentHeight).toBe(20);
      expect(long.contentHeight).toBeGreaterThan(10); // taller than the viewport it is shown in
    } finally {
      random.mockRestore();
    }
  });

  it("reports the rows its viewport shows: all of them at the bottom, one less while the notice takes a row", async () => {
    expect((await reported(20, 10)).viewportHeight).toBe(10);
    const calls: number[] = [];
    await renderFrame(
      <MessageList
        cwd="D:\\proj"
        version="0"
        height={10}
        timeline={conversation(20)}
        expandedToolCallIds={new Set()}
        scrollOffset={4}
        onMeasure={(_, viewportHeight) => calls.push(viewportHeight)}
      />,
      60,
    );
    expect(calls.at(-1)).toBe(9);
  });
});

describe("NoticeLine", () => {
  it("shows a quiet dot before the text", async () => {
    expect(await lines(<NoticeLine notice={notice("Mode: plan")} />)).toEqual(["· Mode: plan"]);
  });

  it("keeps a multi-line notice, such as the help text, aligned under its first line", async () => {
    expect(await lines(<NoticeLine notice={notice("Commands:\n  /help  show help\n  /exit  exit")} />)).toEqual(["· Commands:", "    /help  show help", "    /exit  exit"]);
  });

  it("wraps long text inside the column that starts after the dot", async () => {
    const rows = await lines(<NoticeLine notice={notice("word ".repeat(20).trim())} />, 24);
    expect(rows.length).toBeGreaterThan(2);
    expect(rows[0]!.startsWith("· ")).toBe(true);
    for (const row of rows.slice(1)) expect(row.startsWith("  ")).toBe(true);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(24);
  });
});

describe("MessageBubble: ordinary messages", () => {
  it("still shows the user's text after a prompt, and the assistant's indented", async () => {
    expect(await lines(<MessageBubble message={{ kind: "message", id: "u", role: "user", content: "hello" }} />)).toEqual(["> hello"]);
    expect(await lines(<MessageBubble message={{ kind: "message", id: "a", role: "assistant", content: "hi there" }} />)).toEqual(["  hi there"]);
  });
});
