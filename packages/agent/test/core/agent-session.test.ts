import { describe, expect, it, vi } from "vitest";
import { ok, type Result } from "@cortex/shared";
import type { ChatMessage, LLMProvider } from "@cortex/llm";
import { createAgentSession } from "../../src/core/agent-session.js";
import type { Executor } from "../../src/types.js";

/** Snapshots `messages` at call time, since the real array is mutated (pushed to) after each call returns. */
function llmReturning(...responses: Result<ChatMessage>[]): { llm: LLMProvider; sentMessages: ChatMessage[][] } {
  const sentMessages: ChatMessage[][] = [];
  let callIndex = 0;
  const chat = vi.fn(async (request: { messages: ChatMessage[] }) => {
    sentMessages.push([...request.messages]);
    const response = responses[callIndex];
    callIndex += 1;
    if (!response) throw new Error("llmReturning: not enough responses queued");
    return response;
  });
  return { llm: { chat }, sentMessages };
}

async function collect<T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("createAgentSession", () => {
  it("renders the system prompt with the given workspaceRoot on the first LLM call", async () => {
    const { llm, sentMessages } = llmReturning(ok({ role: "assistant", content: "hi" }));
    const executor: Executor = { execute: vi.fn() };
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo" });

    await collect(session.chat("hello"));

    expect(sentMessages[0]?.[0]?.role).toBe("system");
    expect(sentMessages[0]?.[0]?.content).toContain("/repo");
  });

  it("carries conversation history across multiple chat() calls", async () => {
    const { llm, sentMessages } = llmReturning(
      ok({ role: "assistant", content: "first answer" }),
      ok({ role: "assistant", content: "second answer" }),
    );
    const executor: Executor = { execute: vi.fn() };
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo" });

    await collect(session.chat("first question"));
    await collect(session.chat("second question"));

    const roles = sentMessages[1]?.map((m) => `${m.role}:${m.content}`);
    expect(roles).toEqual([
      expect.stringContaining("system:"),
      "user:first question",
      "assistant:first answer",
      "user:second question",
    ]);
  });

  it("yields the final message event from the underlying tool loop", async () => {
    const { llm } = llmReturning(ok({ role: "assistant", content: "the answer" }));
    const executor: Executor = { execute: vi.fn() };
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo" });

    const events = await collect(session.chat("what is it?"));

    expect(events).toEqual([{ type: "message", content: "the answer" }]);
  });
});
