import React from "react";
import { describe, expect, it } from "vitest";
import { MessageBubble, NoticeLine } from "../../../src/ui/components/Messages.js";
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

describe("NoticeLine", () => {
  it("shows a quiet dot before the text", async () => {
    expect(await lines(<NoticeLine notice={notice("Mode: plan")} />)).toEqual(["· Mode: plan"]);
  });

  it("keeps a multi-line notice, such as the help text, aligned under its first line", async () => {
    expect(await lines(<NoticeLine notice={notice("Commands:\n  /help  show help\n  /quit  exit")} />)).toEqual(["· Commands:", "    /help  show help", "    /quit  exit"]);
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
