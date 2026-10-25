import { describe, expect, it, vi } from "vitest";
import { err, ok, CortexError } from "@cortex/core";
import type { ChatMessage, LLMProvider } from "@cortex/providers";
import { compactHistory, estimateTokens } from "../src/compaction.js";

function summarizer(text = "SUMMARY") {
  const chat = vi.fn().mockResolvedValue(ok({ role: "assistant", content: text }));
  return { llm: { chat } as LLMProvider, chat };
}

const big = "x".repeat(4000);
const system: ChatMessage = { role: "system", content: "system prompt" };

/** system, a long first turn with a tool call, then a second turn with another tool call. */
function longHistory(): ChatMessage[] {
  return [
    system,
    { role: "user", content: big },
    { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a" } }] },
    { role: "tool", name: "read_file", content: big },
    { role: "assistant", content: "ok" },
    { role: "user", content: "next question" },
    { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "b" } }] },
    { role: "tool", name: "read_file", content: "r" },
  ];
}

describe("estimateTokens", () => {
  it("grows with the amount of content", () => {
    expect(estimateTokens([{ role: "user", content: "hi" }])).toBeLessThan(estimateTokens([{ role: "user", content: big }]));
  });
});

describe("compactHistory", () => {
  it("does nothing under the budget", async () => {
    const { llm, chat } = summarizer();
    const history: ChatMessage[] = [system, { role: "user", content: "hi" }];

    expect(await compactHistory(history, { llm, maxTokens: 1000 })).toBeNull();
    expect(chat).not.toHaveBeenCalled();
    expect(history).toHaveLength(2);
  });

  it("replaces older turns with a summary, keeping the system message and a tail that starts at a user turn", async () => {
    const { llm } = summarizer();
    const history = longHistory();

    const result = await compactHistory(history, { llm, maxTokens: 500, keepRecent: 3 });

    expect(result).not.toBeNull();
    expect(result!.after).toBeLessThan(result!.before);
    expect(history[0]).toBe(system);
    expect(history[1]!.content).toContain("[Summary of earlier conversation]\nSUMMARY");
    // the tail must not begin with an orphaned tool result
    expect(history[2]).toEqual({ role: "user", content: "next question" });
    expect(history).toHaveLength(5);
  });

  it("sends the older turns, with a summary instruction, to the model", async () => {
    const { llm, chat } = summarizer();
    await compactHistory(longHistory(), { llm, maxTokens: 500, keepRecent: 3 });

    const sent = chat.mock.calls[0]![0].messages as ChatMessage[];
    expect(sent[0]!.role).toBe("system");
    expect(sent[0]!.content).toMatch(/Summarize the conversation/);
    expect(sent.at(-1)).toEqual({ role: "user", content: "Write the summary now." });
    expect(sent.some((m) => m.content === "next question")).toBe(false);
  });

  it("does nothing when there is no safe place to cut", async () => {
    const { llm, chat } = summarizer();
    const history: ChatMessage[] = [system, { role: "user", content: big }];

    expect(await compactHistory(history, { llm, maxTokens: 10 })).toBeNull();
    expect(chat).not.toHaveBeenCalled();
  });

  it("leaves the history untouched when the summary request fails", async () => {
    const llm: LLMProvider = { chat: vi.fn().mockResolvedValue(err(new CortexError("down", "TEST_DOWN"))) };
    const history = longHistory();
    const before = [...history];

    expect(await compactHistory(history, { llm, maxTokens: 500, keepRecent: 3 })).toBeNull();
    expect(history).toEqual(before);
  });
});
