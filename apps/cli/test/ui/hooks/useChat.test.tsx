import React from "react";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentEvent, AgentSession } from "@cortex/agent";
import { builtinTools, registerTool } from "@cortex/tools";
import { createPermissionBridge, type PermissionBridge } from "../../../src/runtime/permission-bridge.js";
import { useChat, type Chat } from "../../../src/ui/hooks/useChat.js";
import type { ToolCallEntry } from "../../../src/ui/types.js";
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
