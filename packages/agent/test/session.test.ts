import { describe, expect, it, vi } from "vitest";
import { ok, type Result } from "@cortex/core";
import type { ChatMessage, LLMProvider } from "@cortex/providers";
import { promises as fs } from "node:fs";
import path from "node:path";
import { registerTool, type ToolDefinition } from "@cortex/tools";
import { createAgentSession, toToolSpec } from "../src/session.js";
import type { AgentPolicy, Executor } from "../src/types.js";

const { gatherContextMock } = vi.hoisted(() => ({ gatherContextMock: vi.fn().mockResolvedValue("") }));
vi.mock("@cortex/context", () => ({ gatherContext: gatherContextMock }));

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

/** Every event except the `context` size reports, which these tests are not about. */
async function collect<T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of gen) if ((event as { type?: string }).type !== "context") events.push(event);
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

  it("passes the given signal through to the underlying tool loop", async () => {
    const { llm } = llmReturning(ok({ role: "assistant", content: "hi" }));
    const chat = llm.chat as unknown as ReturnType<typeof vi.fn>;
    const executor: Executor = { execute: vi.fn() };
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo" });
    const controller = new AbortController();

    await collect(session.chat("hello", controller.signal));

    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("calls gatherContext with the workspaceRoot, the user's message, and the signal", async () => {
    const { llm } = llmReturning(ok({ role: "assistant", content: "hi" }));
    const executor: Executor = { execute: vi.fn() };
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo" });
    const controller = new AbortController();
    gatherContextMock.mockClear();

    await collect(session.chat("what does this project do?", controller.signal));

    expect(gatherContextMock).toHaveBeenCalledWith({
      workspaceRoot: "/repo",
      userMessage: "what does this project do?",
      signal: controller.signal,
    });
  });

  it("threads gatherContext's result into the tool loop as contextBlock", async () => {
    const { llm, sentMessages } = llmReturning(ok({ role: "assistant", content: "hi" }));
    const executor: Executor = { execute: vi.fn() };
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo" });
    gatherContextMock.mockResolvedValueOnce("# Workspace Context\n\nsome info");

    await collect(session.chat("hello"));

    expect(sentMessages[0]?.at(-1)).toEqual({ role: "user", content: "# Workspace Context\n\nsome info" });
  });
});

describe("toToolSpec", () => {
  it("maps a ToolDefinition to a ToolSpec, renaming parametersSchema", () => {
    const tool: ToolDefinition = {
      name: "read_file",
      description: "Read a file",
      kind: "read" as const,
      parametersSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async () => ({ ok: true, value: undefined }),
    };

    expect(toToolSpec(tool)).toEqual({
      name: "read_file",
      description: "Read a file",
      parametersSchema: tool.parametersSchema,
    });
  });
});

describe("createAgentSession with policy, memory, skills and tool exclusion", () => {
  const executor: Executor = { execute: vi.fn() };
  const policy = (overrides: Partial<AgentPolicy> = {}): AgentPolicy => ({
    mode: "default",
    rules: { allow: [], deny: [] },
    hooks: [],
    askPermission: vi.fn().mockResolvedValue(true),
    ...overrides,
  });
  const exit = (code: number, message = "") => `node -e "process.stderr.write('${message}');process.exit(${code})"`;

  it("puts the memory and the skill index into the system prompt", async () => {
    const { llm, sentMessages } = llmReturning(ok({ role: "assistant", content: "hi" }));
    const session = createAgentSession({
      llm,
      executor,
      workspaceRoot: "/repo",
      memory: "# Project instructions\nuse tabs",
      skillIndex: "- review: Reviews diffs",
    });

    await collect(session.chat("hello"));

    expect(sentMessages[0]![0]!.content).toContain("use tabs");
    expect(sentMessages[0]![0]!.content).toContain("- review: Reviews diffs");
  });

  it("re-renders the system message every turn, so a mode change reaches the model", async () => {
    const { llm, sentMessages } = llmReturning(ok({ role: "assistant", content: "one" }), ok({ role: "assistant", content: "two" }));
    const p = policy();
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo", policy: p });

    await collect(session.chat("first"));
    p.mode = "plan";
    await collect(session.chat("second"));

    expect(sentMessages[0]![0]!.content).not.toMatch(/Plan mode/);
    expect(sentMessages[1]![0]!.content).toMatch(/Plan mode/);
  });

  it("stops the turn, without calling the model, when a UserPromptSubmit hook blocks", async () => {
    const { llm } = llmReturning();
    const p = policy({ hooks: [{ event: "UserPromptSubmit", command: exit(2, "no secrets in prompts") }] });
    const session = createAgentSession({ llm, executor, workspaceRoot: process.cwd(), policy: p });

    const events = await collect(session.chat("my password is hunter2"));

    expect(events).toEqual([{ type: "message", content: "no secrets in prompts" }]);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("runs the Stop hook after the turn", async () => {
    const dir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    try {
      const { llm } = llmReturning(ok({ role: "assistant", content: "done" }));
      const marker = `node -e "require('fs').writeFileSync('stop-marker.txt','x')"`;
      const session = createAgentSession({
        llm,
        executor,
        workspaceRoot: dir,
        policy: policy({ hooks: [{ event: "Stop", command: marker }] }),
      });

      await collect(session.chat("hi"));

      await expect(fs.access(path.join(dir, "stop-marker.txt"))).resolves.toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("offers every registered tool except the excluded ones", async () => {
    registerTool({ name: "session-test-visible", description: "", kind: "read", parametersSchema: {}, handler: async () => ok(null) });
    registerTool({ name: "session-test-hidden", description: "", kind: "read", parametersSchema: {}, handler: async () => ok(null) });
    const { llm } = llmReturning(ok({ role: "assistant", content: "hi" }));
    const chat = llm.chat as unknown as ReturnType<typeof vi.fn>;
    const session = createAgentSession({ llm, executor, workspaceRoot: "/repo", excludeTools: ["session-test-hidden"] });

    await collect(session.chat("hello"));

    const offered = (chat.mock.calls[0]![0].tools as { name: string }[]).map((t) => t.name);
    expect(offered).toContain("session-test-visible");
    expect(offered).not.toContain("session-test-hidden");
  });
});
