import { describe, expect, it } from "vitest";
import { toGroqMessage } from "../../src/groq/mappers/message.js";

describe("toGroqMessage", () => {
  it("maps a plain message without tool_calls or tool_call_id", () => {
    expect(toGroqMessage({ role: "user", content: "hello" })).toEqual({ role: "user", content: "hello" });
  });

  it("stringifies tool call arguments and synthesizes a matching id", () => {
    const mapped = toGroqMessage({
      role: "assistant",
      content: "",
      toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }],
    });
    expect(mapped.tool_calls).toEqual([
      { id: "call_read_file", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
    ]);
  });

  it("attaches a tool_call_id derived from name on a tool-result message", () => {
    const mapped = toGroqMessage({ role: "tool", name: "read_file", content: "file contents" });
    expect(mapped.tool_call_id).toBe("call_read_file");
  });
});
