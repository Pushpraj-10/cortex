import React from "react";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LLM_ERROR_PREFIX, type AgentEvent, type AgentSession } from "@cortex/agent";
import { builtinTools, registerTool } from "@cortex/tools";
import { createPermissionBridge, type PermissionBridge } from "../../../src/runtime/permission-bridge.js";
import { useChat, type Chat } from "../../../src/ui/hooks/useChat.js";
import type { MessageEntry, ToolCallEntry } from "../../../src/ui/types.js";
import { mountElement, settle } from "../support/render-frame.js";

let cwd: string;

beforeAll(async () => {
  for (const tool of builtinTools) registerTool(tool);
  cwd = await fs.mkdtemp(path.join(process.cwd(), "test-"));
});

afterAll(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

/** Mounts useChat with a fake agent session that plays `script`, and returns handles to drive and read it. */
function mount(script: (signal: AbortSignal | undefined, permissions: PermissionBridge) => AsyncGenerator<AgentEvent, void, void>) {
  const permissions = createPermissionBridge();
  const session: AgentSession = { chat: (_text, signal) => script(signal, permissions) };
  const latest: { current: Chat | undefined } = { current: undefined };

  function Harness() {
    latest.current = useChat(session, permissions, cwd);
    return null;
  }

  const mounted = mountElement(<Harness />);
  return { chat: () => latest.current!, unmount: mounted.unmount };
}

const toolCalls = (chat: Chat) => chat.timeline.filter((entry): entry is ToolCallEntry => entry.kind === "toolCall");
const editArgs = { path: "f.txt", oldString: "two", newString: "2" };

describe("useChat: a tool call's life", () => {
  it("records a successful edit with the diff it made, taken before the file changed", async () => {
    await fs.writeFile(path.join(cwd, "f.txt"), "one\ntwo\nthree", "utf-8");
    const { chat, unmount } = mount(async function* () {
      yield { type: "toolCall", toolName: "edit_file", args: editArgs };
      await fs.writeFile(path.join(cwd, "f.txt"), "one\n2\nthree", "utf-8"); // what the tool would do
      yield { type: "toolResult", toolName: "edit_file", output: { success: true }, ok: true };
      yield { type: "message", content: "done" };
    });

    await chat().submit("edit it");
    await settle();

    const [call] = toolCalls(chat());
    expect(call).toMatchObject({ summary: "Edit f.txt", toolKind: "edit", status: "success" });
    expect(call!.preview).toMatchObject({ kind: "diff", before: "one\ntwo\nthree", after: "one\n2\nthree", startLine: 1 });
    expect(call!.durationMs).toBeTypeOf("number");
    expect(call!.detail).toContain("success");
    expect(call!.error).toBeUndefined();
    expect(chat().timeline.map((entry) => entry.kind)).toEqual(["message", "toolCall", "message"]);
    unmount();
  });

  it("records a failed call with the first line of the error", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "toolCall", toolName: "read_file", args: { path: "nope.txt" } };
      yield { type: "toolResult", toolName: "read_file", output: { error: "ENOENT: no such file\nHint: use find_files" }, ok: false };
      yield { type: "message", content: "sorry" };
    });

    await chat().submit("read it");
    await settle();

    expect(toolCalls(chat())[0]).toMatchObject({ status: "error", error: "ENOENT: no such file", toolKind: "read" });
    unmount();
  });

  it("records a refused call as declined, keeping only the first sentence of the message written for the model", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "toolCall", toolName: "run_command", args: { command: "rm -rf /" } };
      yield {
        type: "toolResult",
        toolName: "run_command",
        output: { error: "The user declined this tool call. Do not retry it unchanged; ask what they would prefer." },
        ok: false,
        refused: true,
      };
      yield { type: "message", content: "ok" };
    });

    await chat().submit("run it");
    await settle();

    expect(toolCalls(chat())[0]).toMatchObject({ status: "declined", error: "The user declined this tool call.", toolKind: "execute" });
    expect(toolCalls(chat())[0]!.preview).toEqual({ kind: "command", command: "rm -rf /" });
    unmount();
  });

  it("copes with a tool that is not registered: no preview, no kind", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "toolCall", toolName: "mystery_tool", args: {} };
      yield { type: "toolResult", toolName: "mystery_tool", output: "fine", ok: true };
    });

    await chat().submit("x");
    await settle();

    const [call] = toolCalls(chat());
    expect(call).toMatchObject({ summary: "Run mystery_tool", status: "success" });
    expect(call!.preview).toBeUndefined();
    expect(call!.toolKind).toBeUndefined();
    unmount();
  });
});

describe("useChat: approval", () => {
  it("marks the call as awaiting, exposes its preview to the prompt, and carries on once allowed", async () => {
    await fs.writeFile(path.join(cwd, "f.txt"), "one\ntwo\nthree", "utf-8");
    const { chat, unmount } = mount(async function* (_signal, permissions) {
      yield { type: "toolCall", toolName: "edit_file", args: editArgs };
      const allowed = await permissions.ask("edit_file", editArgs);
      yield { type: "toolResult", toolName: "edit_file", output: { success: true }, ok: allowed };
    });

    const done = chat().submit("edit it");
    await settle();

    expect(chat().pendingPermission).not.toBeNull();
    expect(toolCalls(chat())[0]!.status).toBe("awaiting");
    expect(chat().pendingPreview).toMatchObject({ kind: "diff", path: "f.txt" });

    chat().answerPermission(true);
    await done;
    await settle();

    expect(chat().pendingPermission).toBeNull();
    expect(chat().pendingPreview).toBeUndefined();
    expect(toolCalls(chat())[0]!.status).toBe("success");
    unmount();
  });

  it("shows a call as declined when the user says no", async () => {
    const { chat, unmount } = mount(async function* (_signal, permissions) {
      yield { type: "toolCall", toolName: "edit_file", args: editArgs };
      const allowed = await permissions.ask("edit_file", editArgs);
      yield { type: "toolResult", toolName: "edit_file", output: { error: "The user declined this tool call." }, ok: allowed, ...(allowed ? {} : { refused: true as const }) };
    });

    const done = chat().submit("edit it");
    await settle();
    chat().answerPermission(false);
    await done;
    await settle();

    expect(toolCalls(chat())[0]).toMatchObject({ status: "declined", error: "The user declined this tool call." });
    unmount();
  });
});

describe("useChat: interruption", () => {
  it("does not leave a running call spinning forever when the request is interrupted", async () => {
    const { chat, unmount } = mount(async function* (signal) {
      yield { type: "toolCall", toolName: "run_command", args: { command: "sleep 100" } };
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
    });

    const done = chat().submit("run it");
    await settle();
    expect(toolCalls(chat())[0]!.status).toBe("running");

    chat().cancel();
    await done;
    await settle();

    expect(toolCalls(chat())[0]).toMatchObject({ status: "cancelled", error: "Interrupted" });
    expect(chat().isThinking).toBe(false);
    unmount();
  });

  it("clears the transcript on reset", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "message", content: "hi" };
    });
    await chat().submit("x");
    await settle();
    expect(chat().timeline.length).toBeGreaterThan(0);

    chat().reset();
    await settle();
    expect(chat().timeline).toEqual([]);
    unmount();
  });
});

describe("useChat: streaming text", () => {
  const messages = (chat: Chat) => chat.timeline.filter((entry): entry is MessageEntry => entry.kind === "message");
  const assistant = (chat: Chat) => messages(chat).filter((entry) => entry.role === "assistant");
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it("grows one live message as text arrives, shows the first piece at once, then replaces it with the exact final text", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { chat, unmount } = mount(async function* () {
      yield { type: "messageDelta", delta: "a" };
      yield { type: "messageDelta", delta: "b" };
      yield { type: "messageDelta", delta: "c" };
      await gate;
      yield { type: "message", content: "abc!" };
    });

    const done = chat().submit("go");
    await settle();
    expect(assistant(chat())).toHaveLength(1);
    expect(assistant(chat())[0]).toMatchObject({ content: "a", streaming: true }); // the rest is waiting for its batch

    await wait(120);
    expect(assistant(chat())[0]).toMatchObject({ content: "abc", streaming: true });

    release();
    await done;
    await settle();

    expect(assistant(chat())).toHaveLength(1);
    expect(assistant(chat())[0]).toMatchObject({ content: "abc!", streaming: false });
    unmount();
  });

  it("does not leave a duplicate: the finished message is the live one, not a second copy", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "messageDelta", delta: "Hello" };
      yield { type: "message", content: "Hello" };
    });
    await chat().submit("hi");
    await settle();
    expect(messages(chat()).map((entry) => entry.role)).toEqual(["user", "assistant"]);
    unmount();
  });

  it("keeps what the model said before a tool call as its own message, in order, then streams the next one", async () => {
    await fs.writeFile(path.join(cwd, "f.txt"), "one\ntwo\nthree", "utf-8");
    const { chat, unmount } = mount(async function* () {
      yield { type: "messageDelta", delta: "Let me edit it." };
      yield { type: "message", content: "Let me edit it." };
      yield { type: "toolCall", toolName: "edit_file", args: editArgs };
      yield { type: "toolResult", toolName: "edit_file", output: { success: true }, ok: true };
      yield { type: "messageDelta", delta: "Done." };
      yield { type: "message", content: "Done." };
    });

    await chat().submit("edit");
    await settle();

    expect(chat().timeline.map((entry) => (entry.kind === "message" ? `${entry.role}:${entry.content}` : entry.kind))).toEqual([
      "user:edit",
      "assistant:Let me edit it.",
      "toolCall",
      "assistant:Done.",
    ]);
    expect(assistant(chat()).every((entry) => entry.streaming === false)).toBe(true);
    unmount();
  });

  it("keeps the text already written when the reply fails part-way, and shows the failure after it", async () => {
    const failure = `${LLM_ERROR_PREFIX}connection reset`;
    const { chat, unmount } = mount(async function* () {
      yield { type: "messageDelta", delta: "partial answer" };
      yield { type: "message", content: failure };
    });

    await chat().submit("hi");
    await settle();

    const written = assistant(chat());
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({ content: "partial answer", streaming: false });
    expect(written[0]!.isError).toBeUndefined();
    expect(written[1]).toMatchObject({ content: failure, isError: true });
    unmount();
  });

  it("keeps the partial text and adds no error when the user interrupts the reply", async () => {
    const { chat, unmount } = mount(async function* (signal) {
      yield { type: "messageDelta", delta: "half a sent" };
      await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
      yield { type: "message", content: `${LLM_ERROR_PREFIX}Ollama request was cancelled` };
    });

    const done = chat().submit("hi");
    await settle();
    chat().cancel();
    await done;
    await settle();

    expect(assistant(chat())).toHaveLength(1);
    expect(assistant(chat())[0]).toMatchObject({ content: "half a sent", streaming: false });
    expect(chat().isThinking).toBe(false);
    unmount();
  });

  it("does not leave an empty message when only whitespace was streamed before a tool call", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "messageDelta", delta: "  " };
      yield { type: "message", content: "  " };
      yield { type: "toolCall", toolName: "read_file", args: { path: "f.txt" } };
      yield { type: "toolResult", toolName: "read_file", output: {}, ok: true };
    });

    await chat().submit("x");
    await settle();

    expect(assistant(chat())).toEqual([]);
    expect(toolCalls(chat())).toHaveLength(1);
    unmount();
  });

  it("shows a message that was never streamed, as before", async () => {
    const { chat, unmount } = mount(async function* () {
      yield { type: "message", content: "all at once" };
    });
    await chat().submit("hi");
    await settle();
    expect(assistant(chat())).toMatchObject([{ content: "all at once" }]);
    expect(assistant(chat())[0]!.streaming).toBeUndefined();
    unmount();
  });
});
