import { describe, expect, it } from "vitest";
import { toGroqTools } from "../../src/groq/mappers/tools.js";

describe("toGroqTools", () => {
  it("maps a ToolSpec to Groq's function-calling schema", () => {
    const result = toGroqTools([
      { name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } },
    ]);
    expect(result).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });
});
