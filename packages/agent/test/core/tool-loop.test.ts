import { describe, expect, it, vi } from "vitest";
import { ok, err, CortexError, type Result } from "@cortex/shared";
import type { ChatMessage, LLMProvider } from "@cortex/llm";
import { runToolLoop } from "../../src/core/tool-loop.js";
import type { Executor } from "../../src/types.js";

function llmReturning(...responses: Result<ChatMessage>[]): LLMProvider {
  const chat = vi.fn();
  for (const response of responses) chat.mockResolvedValueOnce(response);
  return { chat };
}

async function collect<T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

describe("runToolLoop", () => {
  it("yields a message event and stops when the model gives plain text (no tool call)", async () => {
    const llm = llmReturning(ok({ role: "assistant", content: "Hello there" }));
    const executor: Executor = { execute: vi.fn() };
    const history: ChatMessage[] = [{ role: "user", content: "hi" }];

    const events = await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(events).toEqual([{ type: "message", content: "Hello there" }]);
    expect(executor.execute).not.toHaveBeenCalled();
    expect(history).toContainEqual({ role: "assistant", content: "Hello there" });
  });

  it("yields toolCall + toolResult, runs only the first call, then loops back to the model", async () => {
    const llm = llmReturning(
      ok({
        role: "assistant",
        content: "",
        toolCalls: [
          { toolName: "add_numbers", args: { a: 1, b: 2 } },
          { toolName: "multiply_numbers", args: { a: 3, b: 4 } },
        ],
      }),
      ok({ role: "assistant", content: "The answer is 3" }),
    );
    const executor: Executor = { execute: vi.fn().mockResolvedValue(ok(3)) };
    const history: ChatMessage[] = [{ role: "user", content: "add 1 and 2" }];

    const events = await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(executor.execute).toHaveBeenCalledWith("add_numbers", { a: 1, b: 2 });
    expect(events).toEqual([
      { type: "toolCall", toolName: "add_numbers", args: { a: 1, b: 2 } },
      { type: "toolResult", toolName: "add_numbers", output: 3 },
      { type: "message", content: "The answer is 3" },
    ]);
  });

  it("pushes the tool result message into history so the model sees it next turn", async () => {
    const llm = llmReturning(
      ok({ role: "assistant", content: "", toolCalls: [{ toolName: "add_numbers", args: { a: 1, b: 2 } }] }),
      ok({ role: "assistant", content: "done" }),
    );
    const executor: Executor = { execute: vi.fn().mockResolvedValue(ok(3)) };
    const history: ChatMessage[] = [{ role: "user", content: "add 1 and 2" }];

    await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(history).toContainEqual({ role: "tool", name: "add_numbers", content: "3" });
  });

  it("wraps a failing tool's error into the tool result content", async () => {
    const llm = llmReturning(
      ok({ role: "assistant", content: "", toolCalls: [{ toolName: "bad_tool", args: {} }] }),
      ok({ role: "assistant", content: "done" }),
    );
    const executor: Executor = {
      execute: vi.fn().mockResolvedValue(err(new CortexError("tool failed", "TEST_TOOL_FAILED"))),
    };
    const history: ChatMessage[] = [{ role: "user", content: "do it" }];

    const events = await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(events[1]).toEqual({ type: "toolResult", toolName: "bad_tool", output: { error: "tool failed" } });
  });

  it("yields a message and stops when the LLM request fails", async () => {
    const llm = llmReturning(err(new CortexError("network down", "TEST_NETWORK_DOWN")));
    const executor: Executor = { execute: vi.fn() };
    const history: ChatMessage[] = [{ role: "user", content: "hi" }];

    const events = await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(events).toEqual([{ type: "message", content: "LLM request failed: network down" }]);
  });

  it("stops after maxIterations without a final answer", async () => {
    const chat = vi.fn().mockResolvedValue(
      ok({ role: "assistant", content: "", toolCalls: [{ toolName: "loop_tool", args: {} }] }),
    );
    const llm: LLMProvider = { chat };
    const executor: Executor = { execute: vi.fn().mockResolvedValue(ok("result")) };
    const history: ChatMessage[] = [{ role: "user", content: "loop forever" }];

    const events = await collect(runToolLoop(history, { llm, executor, tools: [], maxIterations: 2 }));

    expect(events.at(-1)).toEqual({ type: "message", content: "Stopped after 2 turns without a final answer." });
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
