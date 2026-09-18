import { describe, expect, it } from "vitest";
import { isLlmFailureMessage } from "../../src/format/classify-agent-message.js";

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
});
