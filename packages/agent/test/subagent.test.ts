import { describe, expect, it, vi } from "vitest";
import { err, ok, CortexError, type Result } from "@cortex/core";
import type { ChatMessage, LLMProvider } from "@cortex/providers";
import { registerTool } from "@cortex/tools";
import { createToolsExecutor } from "../src/executor.js";
import { createTaskTool, TASK_TOOL_NAME } from "../src/subagent.js";

/** Snapshots `messages` at call time, since the loop mutates the same array after each reply. */
function llmReturning(...responses: Result<ChatMessage>[]) {
  const sentMessages: ChatMessage[][] = [];
  let next = 0;
  const chat = vi.fn(async (request: { messages: ChatMessage[]; tools?: { name: string }[] }) => {
    sentMessages.push([...request.messages]);
    return responses[next++]!;
  });
  return { llm: { chat } as unknown as LLMProvider, chat, sentMessages };
}

registerTool({ name: "subagent-test-tool", description: "a tool", kind: "read", parametersSchema: {}, handler: async () => ok("done") });

describe("createTaskTool", () => {
  const context = { cwd: "/repo" };

  it("is a read-kind tool named task (its inner calls are gated individually)", () => {
    const { llm } = llmReturning();
    const tool = createTaskTool({ llm, executor: createToolsExecutor("/repo"), workspaceRoot: "/repo" });
    expect(tool.name).toBe(TASK_TOOL_NAME);
    expect(tool.kind).toBe("read");
  });

  it("runs a fresh session and returns only the final answer", async () => {
    const { llm, sentMessages } = llmReturning(ok({ role: "assistant", content: "found it in a.ts" }));
    const tool = createTaskTool({ llm, executor: createToolsExecutor("/repo"), workspaceRoot: "/repo" });

    const result = await tool.handler({ description: "find it", prompt: "where is foo defined?" }, context);

    expect(result).toEqual({ ok: true, value: { answer: "found it in a.ts" } });
    expect(sentMessages[0]!.map((m) => m.role)).toEqual(["system", "user"]);
    expect(sentMessages[0]![1]!.content).toBe("where is foo defined?");
  });

  it("withholds the task tool from the subagent so it cannot delegate again", async () => {
    const { llm, chat } = llmReturning(ok({ role: "assistant", content: "ok" }));
    const executor = createToolsExecutor("/repo");
    const tool = createTaskTool({ llm, executor, workspaceRoot: "/repo" });
    registerTool(tool as never);

    await tool.handler({ description: "d", prompt: "p" }, context);

    const offered = (chat.mock.calls[0]![0].tools as { name: string }[]).map((t) => t.name);
    expect(offered).toContain("subagent-test-tool");
    expect(offered).not.toContain(TASK_TOOL_NAME);
  });

  it("reports a failed model request as the answer instead of throwing", async () => {
    const { llm } = llmReturning(err(new CortexError("network down", "TEST_DOWN")));
    const tool = createTaskTool({ llm, executor: createToolsExecutor("/repo"), workspaceRoot: "/repo" });

    const result = await tool.handler({ description: "d", prompt: "p" }, context);

    expect(result.ok && result.value.answer).toContain("LLM request failed: network down");
  });

  it("summarizes a call by its description", () => {
    const { llm } = llmReturning();
    const tool = createTaskTool({ llm, executor: createToolsExecutor("/repo"), workspaceRoot: "/repo" });
    expect(tool.summarize!({ description: "find it", prompt: "p" })).toBe("Delegate: find it");
  });
});
