import { describe, expect, it } from "vitest";
import {
  InvalidProviderError,
  MissingAnthropicApiKeyError,
  MissingAnthropicModelError,
  MissingGoogleApiKeyError,
  MissingGoogleModelError,
  MissingOllamaModelError,
  PROVIDER_ENV,
  PROVIDER_IDS,
  credentialsToEnv,
  isProviderId,
  layerEnv,
  resolveAnthropicConfig,
  resolveGoogleConfig,
  resolveOllamaConfig,
  resolveProvider,
  selectProvider,
} from "../../src/provider/config.js";

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

describe("resolveGoogleConfig", () => {
  it("returns an error Result when GOOGLE_API_KEY is not set", () => {
    const result = resolveGoogleConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(MissingGoogleApiKeyError);
  });

  it("returns an error Result when GOOGLE_MODEL is not set", () => {
    const result = resolveGoogleConfig({ GOOGLE_API_KEY: "key" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(MissingGoogleModelError);
  });

  it("returns ok with apiKey, model, and baseUrl when all are set", () => {
    const result = resolveGoogleConfig({
      GOOGLE_API_KEY: "key",
      GOOGLE_MODEL: "gemini-2.0-flash",
      GOOGLE_BASE_URL: "http://example.test",
    });
    expect(result).toEqual({
      ok: true,
      value: { apiKey: "key", model: "gemini-2.0-flash", baseUrl: "http://example.test" },
    });
  });

  it("passes baseUrl through as undefined when not set, letting the Google client apply its own default", () => {
    const result = resolveGoogleConfig({ GOOGLE_API_KEY: "key", GOOGLE_MODEL: "gemini-2.0-flash" });
    expect(result).toEqual({ ok: true, value: { apiKey: "key", model: "gemini-2.0-flash", baseUrl: undefined } });
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

  it("never picks Google just because GOOGLE_API_KEY is present (it is commonly exported for other tools)", () => {
    const result = selectProvider({ GOOGLE_API_KEY: "key", GOOGLE_MODEL: "g", OLLAMA_MODEL: "llama3.1" });
    expect(result.ok && result.value.id).toBe("ollama");
  });

  it("never picks Anthropic just because ANTHROPIC_API_KEY is present", () => {
    const result = selectProvider({ ANTHROPIC_API_KEY: "key", ANTHROPIC_MODEL: "m", OLLAMA_MODEL: "llama3.1" });
    expect(result.ok && result.value.id).toBe("ollama");
  });

  it("lets CORTEX_PROVIDER override the automatic choice, including opting in to Anthropic", () => {
    const anthropic = selectProvider({ CORTEX_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "key", ANTHROPIC_MODEL: "m", GOOGLE_API_KEY: "g" });
    expect(anthropic.ok && anthropic.value.id).toBe("anthropic");

    const google = selectProvider({ CORTEX_PROVIDER: "google", GOOGLE_API_KEY: "key", GOOGLE_MODEL: "gemini-2.0-flash" });
    expect(google).toEqual({
      ok: true,
      value: { id: "google", model: "gemini-2.0-flash", config: { apiKey: "key", model: "gemini-2.0-flash", baseUrl: undefined } },
    });

    const ollama = selectProvider({ CORTEX_PROVIDER: "ollama", OLLAMA_MODEL: "llama3.1", GOOGLE_API_KEY: "g", GOOGLE_MODEL: "m" });
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

describe("isProviderId", () => {
  it("accepts the known providers only", () => {
    for (const id of PROVIDER_IDS) expect(isProviderId(id)).toBe(true);
    expect(isProviderId("groq")).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});

describe("resolveProvider", () => {
  it("resolves a specific provider regardless of CORTEX_PROVIDER", () => {
    const result = resolveProvider("google", { CORTEX_PROVIDER: "ollama", GOOGLE_API_KEY: "k", GOOGLE_MODEL: "g" });
    expect(result.ok && result.value.id).toBe("google");
  });

  it("reports that provider's missing configuration", () => {
    const result = resolveProvider("anthropic", {});
    expect(!result.ok && result.error).toBeInstanceOf(MissingAnthropicApiKeyError);
  });
});

describe("credentialsToEnv", () => {
  it("expresses saved settings as the environment variables the resolvers read", () => {
    const env = credentialsToEnv({
      activeProvider: "google",
      providers: {
        google: { apiKey: "g-key", model: "gemini-test", baseUrl: "http://g.test" },
        ollama: { model: "llama3.1" },
      },
    });
    expect(env).toEqual({
      GOOGLE_API_KEY: "g-key",
      GOOGLE_MODEL: "gemini-test",
      GOOGLE_BASE_URL: "http://g.test",
      OLLAMA_MODEL: "llama3.1",
      CORTEX_PROVIDER: "google",
    });
  });

  it("ignores providers it does not know and an unknown default", () => {
    expect(credentialsToEnv({ activeProvider: "groq", providers: { groq: { apiKey: "k" } } })).toEqual({});
  });

  it("never maps an API key for a provider that has none (Ollama)", () => {
    expect(credentialsToEnv({ providers: { ollama: { apiKey: "oops", model: "m" } } })).toEqual({ OLLAMA_MODEL: "m" });
  });

  it("round-trips: every provider's saved values come back out of its resolver unchanged", () => {
    for (const id of PROVIDER_IDS) {
      const names = PROVIDER_ENV[id];
      const saved = { ...(names.apiKey ? { apiKey: `${id}-key` } : {}), model: `${id}-model`, baseUrl: `http://${id}.test` };
      const result = resolveProvider(id, credentialsToEnv({ providers: { [id]: saved } }));
      expect(result.ok && result.value.config).toEqual(saved);
    }
  });
});

describe("layerEnv", () => {
  it("lets a set environment variable win over a saved one", () => {
    expect(layerEnv({ GOOGLE_API_KEY: "saved", GOOGLE_MODEL: "m" }, { GOOGLE_API_KEY: "from-env" })).toEqual({
      GOOGLE_API_KEY: "from-env",
      GOOGLE_MODEL: "m",
    });
  });

  it("treats an empty environment variable as unset, so a blank .env line cannot hide a saved key", () => {
    expect(layerEnv({ GOOGLE_API_KEY: "saved" }, { GOOGLE_API_KEY: "", OTHER: "x" })).toEqual({ GOOGLE_API_KEY: "saved", OTHER: "x" });
  });

  it("falls back to the saved default provider when CORTEX_PROVIDER is unset or empty", () => {
    const env = layerEnv({ CORTEX_PROVIDER: "google", GOOGLE_API_KEY: "k", GOOGLE_MODEL: "m" }, { CORTEX_PROVIDER: "" });
    expect(selectProvider(env).ok && (selectProvider(env) as { value: { id: string } }).value.id).toBe("google");
  });

  it("lets CORTEX_PROVIDER in the environment beat the saved default", () => {
    const env = layerEnv({ CORTEX_PROVIDER: "google" }, { CORTEX_PROVIDER: "ollama", OLLAMA_MODEL: "llama3.1" });
    const result = selectProvider(env);
    expect(result.ok && result.value.id).toBe("ollama");
  });
});
