import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LLM_ERROR_PREFIX } from "@cortex/agent";
import { ok } from "@cortex/core";
import { builtinTools, registerTool } from "@cortex/tools";
import { errorSummary, firstSentence, formatDuration, formatToolResultDetail, isLlmFailureMessage, previewToolCall, statusOfResult, summarizeToolCall, toolKindOf } from "../../src/format/tool-calls.js";
import { promises as fs } from "node:fs";
import path from "node:path";

describe("summarizeToolCall", () => {
  beforeAll(() => {
    for (const tool of builtinTools) registerTool(tool);
  });

  it("read_file", () => {
    expect(summarizeToolCall("read_file", { path: "a.ts" })).toBe("Read a.ts");
  });

  it("write_file", () => {
    expect(summarizeToolCall("write_file", { path: "a.ts", content: "x" })).toBe("Write a.ts");
  });

  it("edit_file", () => {
    expect(summarizeToolCall("edit_file", { path: "a.ts" })).toBe("Edit a.ts");
  });

  it("delete_file", () => {
    expect(summarizeToolCall("delete_file", { path: "a.ts" })).toBe("Delete a.ts");
  });

  it("list_directory", () => {
    expect(summarizeToolCall("list_directory", { path: "src" })).toBe("List src");
  });

  it("create_directory", () => {
    expect(summarizeToolCall("create_directory", { path: "src/new" })).toBe("Create directory src/new");
  });

  it("move_file", () => {
    expect(summarizeToolCall("move_file", { from: "a.ts", to: "b.ts" })).toBe("Move a.ts → b.ts");
  });

  it("copy_file", () => {
    expect(summarizeToolCall("copy_file", { from: "a.ts", to: "b.ts" })).toBe("Copy a.ts → b.ts");
  });

  it("file_exists", () => {
    expect(summarizeToolCall("file_exists", { path: "a.ts" })).toBe("Check a.ts exists");
  });

  it("get_file_info", () => {
    expect(summarizeToolCall("get_file_info", { path: "a.ts" })).toBe("Get info for a.ts");
  });

  it("run_command, find_files and search_files", () => {
    expect(summarizeToolCall("run_command", { command: "npm test" })).toBe("Run npm test");
    expect(summarizeToolCall("find_files", { pattern: "**/*.ts" })).toBe("Find **/*.ts");
    expect(summarizeToolCall("search_files", { pattern: "TODO" })).toBe("Search for TODO");
  });

  it("uses the summary a custom tool provides, with no list of tool names involved", () => {
    registerTool({
      name: "tool-calls-test-custom",
      description: "",
      kind: "read",
      parametersSchema: {},
      summarize: (args) => `Custom ${(args as { what: string }).what}`,
      handler: async () => ok(null),
    });
    expect(summarizeToolCall("tool-calls-test-custom", { what: "thing" })).toBe("Custom thing");
  });

  it("falls back to a generic summary for an unregistered tool name", () => {
    expect(summarizeToolCall("some_future_tool", { x: 1 })).toBe("Run some_future_tool");
  });

  it("falls back to a generic summary for a registered tool without a summarize", () => {
    registerTool({ name: "tool-calls-test-plain", description: "", kind: "read", parametersSchema: {}, handler: async () => ok(null) });
    expect(summarizeToolCall("tool-calls-test-plain", {})).toBe("Run tool-calls-test-plain");
  });

  it("falls back to '?' for a missing or malformed path arg", () => {
    expect(summarizeToolCall("read_file", {})).toBe("Read ?");
    expect(summarizeToolCall("read_file", { path: 123 })).toBe("Read ?");
    expect(summarizeToolCall("read_file", null)).toBe("Read ?");
  });
});

describe("formatToolResultDetail", () => {
  it("pretty-prints an object", () => {
    expect(formatToolResultDetail({ success: true })).toBe('{\n  "success": true\n}');
  });

  it("passes a string through unchanged", () => {
    expect(formatToolResultDetail("plain text")).toBe("plain text");
  });

  it("truncates output past the max length", () => {
    const longString = "x".repeat(3000);
    const result = formatToolResultDetail(longString);
    expect(result.length).toBeLessThan(3000);
    expect(result.endsWith("… (truncated)")).toBe(true);
  });

  it("does not truncate output at or under the max length", () => {
    const content = "x".repeat(100);
    expect(formatToolResultDetail(content)).toBe(content);
  });
});

describe("isLlmFailureMessage", () => {
  it("returns true for the LLM request failed message shape", () => {
    expect(isLlmFailureMessage("LLM request failed: Ollama returned 500")).toBe(true);
  });

  it("returns false for a normal assistant message", () => {
    expect(isLlmFailureMessage("Here is your answer.")).toBe(false);
  });

  it("returns false for the max-iterations stop message (not a failure, just a budget cap)", () => {
    expect(isLlmFailureMessage("Stopped after 16 turns without a final answer.")).toBe(false);
  });

  it("matches the exact prefix the agent yields, so the two cannot drift apart", () => {
    expect(isLlmFailureMessage(`${LLM_ERROR_PREFIX}anything`)).toBe(true);
  });
});

describe("statusOfResult", () => {
  it("is success when ok, declined when a decision refused the call, error otherwise", () => {
    expect(statusOfResult({ ok: true })).toBe("success");
    expect(statusOfResult({ ok: false })).toBe("error");
    expect(statusOfResult({ ok: false, refused: true })).toBe("declined");
  });
});

describe("formatDuration", () => {
  it("shows tenths of a second under a minute", () => {
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(400)).toBe("0.4s");
    expect(formatDuration(12_345)).toBe("12.3s");
  });

  it("switches to minutes and seconds, never showing 60.0s", () => {
    expect(formatDuration(59_940)).toBe("59.9s");
    expect(formatDuration(59_960)).toBe("1m 00s");
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(125_000)).toBe("2m 05s");
  });

  it("treats a negative time as zero", () => {
    expect(formatDuration(-50)).toBe("0.0s");
  });
});

describe("errorSummary", () => {
  it("takes the first line of the error a failed call returned", () => {
    expect(errorSummary({ error: "File not found\nHint: use find_files" })).toBe("File not found");
  });

  it("takes the first line of a plain string, and has a fallback for anything else", () => {
    expect(errorSummary("boom\nmore")).toBe("boom");
    expect(errorSummary(undefined)).toBe("The call failed.");
    expect(errorSummary({ other: 1 })).toBe("The call failed.");
  });
});

describe("formatToolResultDetail for command-style results", () => {
  it("shows the output text of a { output, exitCode } result, as a terminal would", () => {
    expect(formatToolResultDetail({ output: "hello", exitCode: 0, timedOut: false })).toBe("hello");
  });

  it("says so when a command printed nothing", () => {
    expect(formatToolResultDetail({ output: "", exitCode: 0 })).toBe("(no output)");
  });

  it("notes a non-zero exit code and a timeout", () => {
    expect(formatToolResultDetail({ output: "boom", exitCode: 2 })).toBe("boom\n[exit code 2]");
    expect(formatToolResultDetail({ output: "", exitCode: 1 })).toBe("[exit code 1]");
    expect(formatToolResultDetail({ output: "partial", exitCode: 1, timedOut: true })).toBe("partial\n[timed out, exit code 1]");
  });

  it("does not treat an ordinary object as command output, and survives undefined", () => {
    expect(formatToolResultDetail({ output: 5 })).toBe('{\n  "output": 5\n}');
    expect(formatToolResultDetail(undefined)).toBe("undefined");
  });
});

describe("previewToolCall and toolKindOf", () => {
  let cwd: string;

  beforeAll(async () => {
    for (const tool of builtinTools) registerTool(tool);
    cwd = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    await fs.writeFile(path.join(cwd, "f.txt"), "one\ntwo\nthree", "utf-8");
  });

  afterAll(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("asks the tool for its preview: a diff for an edit, a command for a shell call", async () => {
    expect(await previewToolCall("edit_file", { path: "f.txt", oldString: "two", newString: "2" }, cwd)).toEqual({
      kind: "diff",
      path: "f.txt",
      before: "one\ntwo\nthree",
      after: "one\n2\nthree",
      startLine: 1,
    });
    expect(await previewToolCall("run_command", { command: "ls" }, cwd)).toEqual({ kind: "command", command: "ls" });
  });

  it("returns nothing for an unregistered tool, a tool without a preview, or bad arguments", async () => {
    expect(await previewToolCall("no_such_tool", {}, cwd)).toBeUndefined();
    expect(await previewToolCall("read_file", { path: "f.txt" }, cwd)).toBeUndefined();
    expect(await previewToolCall("edit_file", null, cwd)).toBeUndefined();
  });

  it("returns nothing, rather than throwing, when a tool's preview throws", async () => {
    registerTool({
      name: "tool-calls-test-throwing-preview",
      description: "",
      kind: "edit",
      parametersSchema: {},
      preview: async () => {
        throw new Error("boom");
      },
      handler: async () => ok(null),
    });
    expect(await previewToolCall("tool-calls-test-throwing-preview", {}, cwd)).toBeUndefined();
  });

  it("reports what a tool does to the world, from the tool itself", () => {
    expect(toolKindOf("read_file")).toBe("read");
    expect(toolKindOf("edit_file")).toBe("edit");
    expect(toolKindOf("run_command")).toBe("execute");
    expect(toolKindOf("no_such_tool")).toBeUndefined();
  });
});

describe("firstSentence", () => {
  it("keeps only the first sentence of a refusal written for the model", () => {
    expect(firstSentence("The user declined this tool call. Do not retry it unchanged; ask what they would prefer.")).toBe("The user declined this tool call.");
    expect(firstSentence("Permission denied for edit_file (mode: plan). Do not retry.")).toBe("Permission denied for edit_file (mode: plan).");
  });

  it("does not stop at a dot inside a word or path", () => {
    expect(firstSentence("Failed to read src/a.ts: ENOENT")).toBe("Failed to read src/a.ts: ENOENT");
  });

  it("returns a message with no full stop whole, trimmed", () => {
    expect(firstSentence("  Blocked by hook  ")).toBe("Blocked by hook");
    expect(firstSentence("")).toBe("");
  });
});
