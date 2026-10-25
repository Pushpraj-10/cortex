import { describe, expect, it } from "vitest";
import { compactMessages } from "../../src/context/compact-messages";
import type { LlmProvider, Message } from "../../src/llm/types";

const summarizer: LlmProvider = {
  async complete() {
    return { content: [{ type: "text", text: "SUMMARY" }], stopReason: "end_turn" };
  },
};

const big = "x".repeat(4000);

describe("compactMessages", () => {
  it("is a no-op under budget", async () => {
    const msgs: Message[] = [{ role: "user", content: "hi" }];
    expect(await compactMessages(msgs, { provider: summarizer, maxTokens: 1000 })).toBe(msgs);
  });

  it("summarizes old turns and keeps a tail that starts at a user turn", async () => {
    const msgs: Message[] = [
      { role: "user", content: big },
      { role: "assistant", content: [{ type: "tool_use", id: "1", name: "Read", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: big }] },
      { role: "assistant", content: "ok" },
      { role: "user", content: "next question" },
      { role: "assistant", content: [{ type: "tool_use", id: "2", name: "Read", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "2", content: "r" }] },
    ];
    const out = await compactMessages(msgs, { provider: summarizer, maxTokens: 500, keepRecent: 3 });
    expect(out[0]!.content).toContain("SUMMARY");
    // the tail must not begin with an orphaned tool_result
    expect(out[1]).toEqual(msgs[4]);
    expect(out).toHaveLength(4);
  });
});
