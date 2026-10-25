import { describe, expect, it } from "vitest";
import { buildRequestBody } from "../../src/groq/request-builder.js";

describe("buildRequestBody (groq)", () => {
  it("omits tools when the request has none", () => {
    const body = buildRequestBody(
      { apiKey: "key", model: "llama-3.1-8b-instant" },
      { messages: [{ role: "user", content: "hi" }] },
    );
    expect(body.tools).toBeUndefined();
    expect(body.model).toBe("llama-3.1-8b-instant");
  });

  it("includes mapped tools when the request has some", () => {
    const body = buildRequestBody(
      { apiKey: "key", model: "llama-3.1-8b-instant" },
      {
        messages: [{ role: "user", content: "hi" }],
        tools: [{ name: "read_file", description: "Reads a file", parametersSchema: {} }],
      },
    );
    expect(body.tools).toHaveLength(1);
  });
});
