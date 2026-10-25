import { describe, expect, it } from "vitest";
import { toOllamaTools } from "../../src/ollama/mappers/tools.js";

describe("toOllamaTools", () => {
  it("maps ToolSpec[] to Ollama's function-calling tool schema", () => {
    const result = toOllamaTools([
      { name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } },
    ]);
    expect(result).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });

  it("maps an empty list to an empty list", () => {
    expect(toOllamaTools([])).toEqual([]);
  });
});
