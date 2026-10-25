import { describe, expect, it } from "vitest";
import {
  InvalidProviderError,
  MissingAnthropicApiKeyError,
  MissingAnthropicModelError,
  MissingGroqApiKeyError,
  MissingGroqModelError,
  MissingOllamaModelError,
  resolveAnthropicConfig,
  resolveGroqConfig,
  resolveOllamaConfig,
  selectProvider,
} from "../src/provider-config.js";

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

describe("resolveAnthropicConfig", () => {
  it("returns an error Result when ANTHROPIC_API_KEY is not set", () => {
    const result = resolveAnthropicConfig({ ANTHROPIC_MODEL: "m" });
    expect(!result.ok && result.error).toBeInstanceOf(MissingAnthropicApiKeyError);
  });

  it("returns an error Result when ANTHROPIC_MODEL is not set", () => {
    const result = resolveAnthropicConfig({ ANTHROPIC_API_KEY: "key" });
    expect(!result.ok && result.error).toBeInstanceOf(MissingAnthropicModelError);
  });

  it("returns ok with apiKey, model and baseUrl", () => {
    const result = resolveAnthropicConfig({ ANTHROPIC_API_KEY: "key", ANTHROPIC_MODEL: "m", ANTHROPIC_BASE_URL: "http://example.test" });
    expect(result).toEqual({ ok: true, value: { apiKey: "key", model: "m", baseUrl: "http://example.test" } });
  });
});

describe("selectProvider", () => {
  it("defaults to Ollama when nothing else is configured", () => {
    const result = selectProvider({ OLLAMA_MODEL: "llama3.1" });
    expect(result).toEqual({ ok: true, value: { id: "ollama", model: "llama3.1", config: { model: "llama3.1", baseUrl: undefined } } });
  });

  it("picks Groq when GROQ_API_KEY is set", () => {
    const result = selectProvider({ GROQ_API_KEY: "key", GROQ_MODEL: "g", OLLAMA_MODEL: "llama3.1" });
    expect(result.ok && result.value.id).toBe("groq");
  });

  it("never picks Anthropic just because ANTHROPIC_API_KEY is present", () => {
    const result = selectProvider({ ANTHROPIC_API_KEY: "key", ANTHROPIC_MODEL: "m", OLLAMA_MODEL: "llama3.1" });
    expect(result.ok && result.value.id).toBe("ollama");
  });

  it("lets CORTEX_PROVIDER override the automatic choice, including opting in to Anthropic", () => {
    const anthropic = selectProvider({ CORTEX_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "key", ANTHROPIC_MODEL: "m", GROQ_API_KEY: "g" });
    expect(anthropic.ok && anthropic.value.id).toBe("anthropic");

    const ollama = selectProvider({ CORTEX_PROVIDER: "ollama", OLLAMA_MODEL: "llama3.1", GROQ_API_KEY: "g", GROQ_MODEL: "m" });
    expect(ollama.ok && ollama.value.id).toBe("ollama");
  });

  it("treats an empty CORTEX_PROVIDER as unset, as in a copied .env.example", () => {
    const result = selectProvider({ CORTEX_PROVIDER: "", OLLAMA_MODEL: "llama3.1" });
    expect(result.ok && result.value.id).toBe("ollama");
  });

  it("rejects an unknown CORTEX_PROVIDER", () => {
    const result = selectProvider({ CORTEX_PROVIDER: "openai" });
    expect(!result.ok && result.error).toBeInstanceOf(InvalidProviderError);
  });

  it("reports the chosen provider's missing configuration", () => {
    const result = selectProvider({ CORTEX_PROVIDER: "anthropic" });
    expect(!result.ok && result.error).toBeInstanceOf(MissingAnthropicApiKeyError);
  });
});
