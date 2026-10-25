import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError, postJson } from "../src/wire.js";

describe("ProviderRequestError", () => {
  it("derives its code from the provider name and keeps the cause", () => {
    const cause = new Error("root");
    const error = new ProviderRequestError("Ollama", "failed", cause);
    expect(error.code).toBe("LLM_OLLAMA_REQUEST_FAILED");
    expect(error.provider).toBe("Ollama");
    expect(error.cause).toBe(cause);
  });
});

describe("postJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const opts = { provider: "Test", baseUrl: "http://t", url: "http://t/x", body: { a: 1 } };

  it("posts JSON with a content-type header and returns the parsed reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJson<{ ok: number }>({ ...opts, headers: { authorization: "Bearer x" } });

    expect(result).toEqual({ ok: true, value: { ok: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer x" });
  });

  it("folds a network failure into a ProviderRequestError naming the base URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await postJson(opts);
    expect(!result.ok && result.error.message).toBe("Failed to reach Test at http://t");
  });

  it("folds a non-2xx status into a ProviderRequestError with the status and body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    const result = await postJson(opts);
    expect(!result.ok && result.error.message).toBe("Test returned 503: nope");
  });
});
