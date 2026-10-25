import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLM_ERROR_PREFIX, type AgentEvent, type AgentSession } from "@cortex/agent";
import { builtinTools, registerTool } from "@cortex/tools";
import { runOnce } from "../../src/cli/run-once.js";

function sessionOf(...events: AgentEvent[]): AgentSession {
  return {
    async *chat() {
      for (const event of events) yield event;
    },
  };
}

describe("runOnce", () => {
  let out: string[];
  let errors: string[];

  beforeEach(() => {
    for (const tool of builtinTools) registerTool(tool);
    out = [];
    errors = [];
    vi.spyOn(console, "log").mockImplementation((text: string) => void out.push(text));
    vi.spyOn(console, "error").mockImplementation((text: string) => void errors.push(text));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the answer to stdout and exits 0", async () => {
    expect(await runOnce(sessionOf({ type: "message", content: "The answer." }), "q")).toBe(0);
    expect(out).toEqual(["The answer."]);
    expect(errors).toEqual([]);
  });

  it("sends tool calls to stderr and only the final answer to stdout", async () => {
    const code = await runOnce(
      sessionOf(
        { type: "toolCall", toolName: "read_file", args: { path: "a.ts" } },
        { type: "toolResult", toolName: "read_file", output: { content: "x" }, ok: true },
        { type: "message", content: "It exports one function." },
      ),
      "q",
    );
    expect(code).toBe(0);
    expect(errors).toEqual(["• Read a.ts"]);
    expect(out).toEqual(["It exports one function."]);
  });

  it("sends what the model said on the way to a tool call to stderr, not into the piped answer", async () => {
    await runOnce(
      sessionOf(
        { type: "message", content: "Let me look at that file." },
        { type: "toolCall", toolName: "read_file", args: { path: "a.ts" } },
        { type: "toolResult", toolName: "read_file", output: {}, ok: true },
        { type: "message", content: "Done." },
      ),
      "q",
    );
    expect(errors).toEqual(["Let me look at that file.", "• Read a.ts"]);
    expect(out).toEqual(["Done."]);
  });

  it("ignores the live text deltas: the whole message follows", async () => {
    await runOnce(sessionOf({ type: "messageDelta", delta: "Hel" }, { type: "messageDelta", delta: "lo" }, { type: "message", content: "Hello" }), "q");
    expect(out).toEqual(["Hello"]);
    expect(errors).toEqual([]);
  });

  it("prints a one-line reason on stderr when a tool call fails, and the first sentence when it was refused", async () => {
    await runOnce(
      sessionOf(
        { type: "toolCall", toolName: "read_file", args: { path: "nope.ts" } },
        { type: "toolResult", toolName: "read_file", output: { error: "ENOENT: no such file\nHint: use find_files" }, ok: false },
        { type: "toolCall", toolName: "run_command", args: { command: "rm x" } },
        { type: "toolResult", toolName: "run_command", output: { error: "The user declined this tool call. Do not retry it unchanged." }, ok: false, refused: true },
        { type: "message", content: "Could not do it." },
      ),
      "q",
    );
    expect(errors).toEqual(["• Read nope.ts", "  ✗ ENOENT: no such file", "• Run rm x", "  ✗ The user declined this tool call."]);
    expect(out).toEqual(["Could not do it."]);
  });

  it("exits 1 and prints the failure when the model request failed", async () => {
    const failure = `${LLM_ERROR_PREFIX}Failed to reach Ollama at http://127.0.0.1:9`;
    expect(await runOnce(sessionOf({ type: "message", content: failure }), "q")).toBe(1);
    expect(out).toEqual([failure]);
  });

  it("exits 1 for a failure that follows narration, printing only the failure to stdout", async () => {
    const failure = `${LLM_ERROR_PREFIX}connection reset`;
    const code = await runOnce(
      sessionOf(
        { type: "message", content: "Looking." },
        { type: "toolCall", toolName: "read_file", args: { path: "a.ts" } },
        { type: "toolResult", toolName: "read_file", output: {}, ok: true },
        { type: "message", content: failure },
      ),
      "q",
    );
    expect(code).toBe(1);
    expect(out).toEqual([failure]);
  });

  it("prints nothing and exits 0 when the session produced no message", async () => {
    expect(await runOnce(sessionOf(), "q")).toBe(0);
    expect(out).toEqual([]);
  });
});
