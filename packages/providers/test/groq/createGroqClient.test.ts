import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroqClient } from "../../src/groq/client.js";
import { GroqRequestError } from "../../src/groq/errors.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createGroqClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the assistant message on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "hi there" } }] })),
    );
    const client = createGroqClient({ apiKey: "key", model: "llama-3.1-8b-instant" });
    const result = await client.chat({ messages: [{ role: "user", content: "hello" }] });
    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "hi there" } });
  });

  it("sends the api key as a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "hi" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGroqClient({ apiKey: "secret-key", model: "llama-3.1-8b-instant" });
    await client.chat({ messages: [{ role: "user", content: "hello" }] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
  });

  it("returns an error Result on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad key" }, 401)));
    const client = createGroqClient({ apiKey: "bad", model: "llama-3.1-8b-instant" });
    const result = await client.chat({ messages: [{ role: "user", content: "hello" }] });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBeInstanceOf(GroqRequestError);
  });
});
