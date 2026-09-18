import { describe, expect, it } from "vitest";
import { fromOllamaToolCalls } from "../../src/ollama/mappers/tool-calls.js";

describe("fromOllamaToolCalls", () => {
  it("maps Ollama tool_calls to ToolCall[]", () => {
    const result = fromOllamaToolCalls([{ function: { name: "read_file", arguments: { path: "main.py" } } }]);
    expect(result).toEqual([{ toolName: "read_file", args: { path: "main.py" } }]);
  });

  it("returns undefined for an absent list", () => {
    expect(fromOllamaToolCalls(undefined)).toBeUndefined();
  });

  it("returns undefined (not []) for an empty list", () => {
    expect(fromOllamaToolCalls([])).toBeUndefined();
  });
});
