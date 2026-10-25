import { beforeAll, describe, expect, it } from "vitest";
import { LLM_ERROR_PREFIX } from "@cortex/agent";
import { ok } from "@cortex/core";
import { builtinTools, registerTool } from "@cortex/tools";
import { formatToolResultDetail, isLlmFailureMessage, summarizeToolCall } from "../../src/format/tool-calls.js";

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
