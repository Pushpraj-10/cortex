import { describe, expect, it } from "vitest";
import { resolveGroqConfig, MissingGroqApiKeyError, MissingGroqModelError } from "../../src/wiring/resolve-groq-config.js";

describe("resolveGroqConfig", () => {
  it("returns an error Result when GROQ_API_KEY is not set", () => {
    const result = resolveGroqConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(MissingGroqApiKeyError);
  });

  it("returns an error Result when GROQ_MODEL is not set", () => {
    const result = resolveGroqConfig({ GROQ_API_KEY: "key" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(MissingGroqModelError);
  });

  it("returns ok with apiKey, model, and baseUrl when all are set", () => {
    const result = resolveGroqConfig({
      GROQ_API_KEY: "key",
      GROQ_MODEL: "llama-3.1-8b-instant",
      GROQ_BASE_URL: "http://example.test",
    });
    expect(result).toEqual({
      ok: true,
      value: { apiKey: "key", model: "llama-3.1-8b-instant", baseUrl: "http://example.test" },
    });
  });

  it("passes baseUrl through as undefined when not set, letting the Groq client apply its own default", () => {
    const result = resolveGroqConfig({ GROQ_API_KEY: "key", GROQ_MODEL: "llama-3.1-8b-instant" });
    expect(result).toEqual({ ok: true, value: { apiKey: "key", model: "llama-3.1-8b-instant", baseUrl: undefined } });
  });
});
