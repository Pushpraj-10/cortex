import { describe, expect, it } from "vitest";
import { resolveOllamaConfig, MissingOllamaModelError } from "../../src/wiring/resolve-ollama-config.js";

describe("resolveOllamaConfig", () => {
  it("returns an error Result when OLLAMA_MODEL is not set", () => {
    const result = resolveOllamaConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(MissingOllamaModelError);
  });

  it("returns ok with model and baseUrl when both are set", () => {
    const result = resolveOllamaConfig({ OLLAMA_MODEL: "llama3.1", OLLAMA_BASE_URL: "http://example.test" });
    expect(result).toEqual({ ok: true, value: { model: "llama3.1", baseUrl: "http://example.test" } });
  });

  it("passes baseUrl through as undefined when not set, letting the Ollama client apply its own default", () => {
    const result = resolveOllamaConfig({ OLLAMA_MODEL: "llama3.1" });
    expect(result).toEqual({ ok: true, value: { model: "llama3.1", baseUrl: undefined } });
  });
});
