import { describe, expect, it } from "vitest";
import { fromGroqToolCalls } from "../../src/groq/mappers/tool-calls.js";

describe("fromGroqToolCalls", () => {
  it("returns undefined for an absent or empty list", () => {
    expect(fromGroqToolCalls(undefined)).toBeUndefined();
    expect(fromGroqToolCalls([])).toBeUndefined();
  });

  it("parses JSON-string arguments into objects", () => {
    const result = fromGroqToolCalls([{ function: { name: "read_file", arguments: '{"path":"a.ts"}' } }]);
    expect(result).toEqual([{ toolName: "read_file", args: { path: "a.ts" } }]);
  });
});
