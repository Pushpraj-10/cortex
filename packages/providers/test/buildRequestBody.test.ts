import { describe, expect, it } from "vitest";
import { buildRequestBody } from "../src/ollama/request-builder.js";

describe("buildRequestBody", () => {
  it("maps messages and sets stream to false", () => {
    const body = buildRequestBody({ model: "llama3.1" }, { messages: [{ role: "user", content: "hi" }] });
    expect(body).toEqual({
      model: "llama3.1",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      options: undefined,
    });
  });

  it("includes temperature in options when provided", () => {
    const body = buildRequestBody({ model: "llama3.1" }, { messages: [], temperature: 0.5 });
    expect(body.options).toEqual({ temperature: 0.5 });
  });

  it("omits tools from the body when the request has none", () => {
    const body = buildRequestBody({ model: "llama3.1" }, { messages: [] });
    expect(body.tools).toBeUndefined();
  });

  it("maps ToolSpec[] to Ollama's function-calling tool schema", () => {
    const body = buildRequestBody(
      { model: "llama3.1" },
      { messages: [], tools: [{ name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } }] },
    );
    expect(body.tools).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });

  it("forwards an assistant message's toolCalls into Ollama's tool_calls shape", () => {
    const body = buildRequestBody(
      { model: "llama3.1" },
      {
        messages: [
          { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
          { role: "tool", content: '{"success":true}' },
        ],
      },
    );
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }],
    });
    expect(body.messages[1]).toEqual({ role: "tool", content: '{"success":true}' });
  });
});
