import { describe, expect, it, vi } from "vitest";
import { ok, err, CortexError, type Result } from "@cortex/core";
import type { ChatMessage, LLMProvider } from "@cortex/providers";
import { LLM_ERROR_PREFIX, runToolLoop } from "../src/loop.js";
import type { Executor } from "../src/types.js";

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
    expect(executor.execute).toHaveBeenCalledWith("add_numbers", { a: 1, b: 2 }, undefined);
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

  it("passes the given signal through to llm.chat", async () => {
    const chat = vi.fn().mockResolvedValue(ok({ role: "assistant", content: "hi" }));
    const llm: LLMProvider = { chat };
    const executor: Executor = { execute: vi.fn() };
    const history: ChatMessage[] = [{ role: "user", content: "hi" }];
    const controller = new AbortController();

    await collect(runToolLoop(history, { llm, executor, tools: [] }, controller.signal));

    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("passes the given signal through to executor.execute", async () => {
    const llm = llmReturning(
      ok({ role: "assistant", content: "", toolCalls: [{ toolName: "add_numbers", args: { a: 1, b: 2 } }] }),
      ok({ role: "assistant", content: "done" }),
    );
    const execute = vi.fn().mockResolvedValue(ok(3));
    const executor: Executor = { execute };
    const history: ChatMessage[] = [{ role: "user", content: "add 1 and 2" }];
    const controller = new AbortController();

    await collect(runToolLoop(history, { llm, executor, tools: [] }, controller.signal));

    expect(execute).toHaveBeenCalledWith("add_numbers", { a: 1, b: 2 }, controller.signal);
  });

  it("appends contextBlock as a trailing user message on the request, without persisting it into history", async () => {
    const chat = vi.fn().mockResolvedValue(ok({ role: "assistant", content: "hi" }));
    const llm: LLMProvider = { chat };
    const executor: Executor = { execute: vi.fn() };
    const history: ChatMessage[] = [{ role: "user", content: "hi" }];

    await collect(runToolLoop(history, { llm, executor, tools: [], contextBlock: "# Workspace Context\n\nsome info" }));

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hi" }, { role: "user", content: "# Workspace Context\n\nsome info" }],
      }),
    );
    expect(history).toEqual([{ role: "user", content: "hi" }, { role: "assistant", content: "hi" }]);
  });

  it("appends contextBlock on every iteration of a multi-tool-call turn", async () => {
    const llm = llmReturning(
      ok({ role: "assistant", content: "", toolCalls: [{ toolName: "add_numbers", args: { a: 1, b: 2 } }] }),
      ok({ role: "assistant", content: "done" }),
    );
    const chat = llm.chat as unknown as ReturnType<typeof vi.fn>;
    const executor: Executor = { execute: vi.fn().mockResolvedValue(ok(3)) };
    const history: ChatMessage[] = [{ role: "user", content: "add 1 and 2" }];

    await collect(runToolLoop(history, { llm, executor, tools: [], contextBlock: "ctx" }));

    expect(chat).toHaveBeenCalledTimes(2);
    for (const call of chat.mock.calls) {
      const messages = call[0].messages as ChatMessage[];
      expect(messages.at(-1)).toEqual({ role: "user", content: "ctx" });
    }
    expect(history.some((m) => m.content === "ctx")).toBe(false);
  });

  it("behaves identically to today when contextBlock is omitted", async () => {
    const chat = vi.fn().mockResolvedValue(ok({ role: "assistant", content: "hi" }));
    const llm: LLMProvider = { chat };
    const executor: Executor = { execute: vi.fn() };
    const history: ChatMessage[] = [{ role: "user", content: "hi" }];

    await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ messages: history }));
  });
});

describe("runToolLoop: output size and compaction", () => {
  it("truncates an oversized tool result in history but yields the full output to the caller", async () => {
    const huge = "x".repeat(40_000);
    const llm = llmReturning(
      ok({ role: "assistant", content: "", toolCalls: [{ toolName: "big_tool", args: {} }] }),
      ok({ role: "assistant", content: "done" }),
    );
    const executor: Executor = { execute: vi.fn().mockResolvedValue(ok(huge)) };
    const history: ChatMessage[] = [{ role: "user", content: "go" }];

    const events = await collect(runToolLoop(history, { llm, executor, tools: [] }));

    expect(events[1]).toEqual({ type: "toolResult", toolName: "big_tool", output: huge });
    const toolMessage = history.find((m) => m.role === "tool")!;
    expect(toolMessage.content.length).toBeLessThan(31_000);
    expect(toolMessage.content).toContain("[output truncated at 30000 characters]");
  });

  it("compacts an over-budget history before asking the model, and says so", async () => {
    const big = "x".repeat(4000);
    // the first model call is the summary request, the second is the real turn
    const llm = llmReturning(ok({ role: "assistant", content: "SUMMARY" }), ok({ role: "assistant", content: "final" }));
    const history: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: big },
      { role: "assistant", content: big },
      { role: "user", content: big },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
      { role: "user", content: "e" },
      { role: "assistant", content: "f" },
      { role: "user", content: "question" },
    ];
    const executor: Executor = { execute: vi.fn() };

    const events = await collect(runToolLoop(history, { llm, executor, tools: [], contextBudgetTokens: 500 }));

    expect(events[0]).toMatchObject({ type: "compacted" });
    expect(events.at(-1)).toEqual({ type: "message", content: "final" });
    expect(history[0]).toEqual({ role: "system", content: "sys" });
    expect(history[1]!.content).toContain("[Summary of earlier conversation]");
  });
});

describe("LLM_ERROR_PREFIX", () => {
  it("prefixes the message yielded when the model request fails", async () => {
    const llm = llmReturning(err(new CortexError("network down", "TEST_NETWORK_DOWN")));
    const executor: Executor = { execute: vi.fn() };

    const events = await collect(runToolLoop([{ role: "user", content: "hi" }], { llm, executor, tools: [] }));

    expect(events[0]).toEqual({ type: "message", content: `${LLM_ERROR_PREFIX}network down` });
    expect(LLM_ERROR_PREFIX).toBe("LLM request failed: ");
  });
});
