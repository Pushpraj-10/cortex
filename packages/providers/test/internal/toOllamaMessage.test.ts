import { describe, expect, it } from "vitest";
import { toOllamaMessage } from "../../src/ollama/mappers/message.js";

describe("toOllamaMessage", () => {
  it("maps role and content, dropping extra ChatMessage fields", () => {
    expect(toOllamaMessage({ role: "tool", content: "result", name: "search" })).toEqual({
      role: "tool",
      content: "result",
    });
  });

  it("forwards toolCalls into Ollama's tool_calls shape", () => {
    const mapped = toOllamaMessage({
      role: "assistant",
      content: "",
      toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }],
    });
    expect(mapped).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }],
    });
  });

  it("omits tool_calls when toolCalls is absent or empty", () => {
    expect(toOllamaMessage({ role: "user", content: "hi" })).toEqual({ role: "user", content: "hi" });
    expect(toOllamaMessage({ role: "assistant", content: "hi", toolCalls: [] })).toEqual({
      role: "assistant",
      content: "hi",
    });
  });
});
