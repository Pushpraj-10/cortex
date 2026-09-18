import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaClient } from "../src/ollama/client.js";
import { OllamaRequestError } from "../src/ollama/errors.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("createOllamaClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the assistant message on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: { content: "hi there" } })));
    const client = createOllamaClient({ model: "llama3.1" });
    const result = await client.chat({ messages: [{ role: "user", content: "hello" }] });
    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "hi there" } });
  });

  it("posts to /api/chat at the configured base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "hi" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOllamaClient({ model: "llama3.1", baseUrl: "http://example.test" });
    await client.chat({ messages: [{ role: "user", content: "hello" }], temperature: 0.2 });

    expect(fetchMock).toHaveBeenCalledWith("http://example.test/api/chat", expect.objectContaining({ method: "POST" }));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      model: "llama3.1",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      options: { temperature: 0.2 },
    });
  });

  it("defaults to http://localhost:11434 when no baseUrl is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "hi" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOllamaClient({ model: "llama3.1" });
    await client.chat({ messages: [] });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.anything());
  });

  it("returns an error Result on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    const client = createOllamaClient({ model: "llama3.1" });
    const result = await client.chat({ messages: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(OllamaRequestError);
  });

  it("returns an error Result when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const client = createOllamaClient({ model: "llama3.1" });
    const result = await client.chat({ messages: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(OllamaRequestError);
  });

  it("returns an error Result when the response has no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const client = createOllamaClient({ model: "llama3.1" });
    const result = await client.chat({ messages: [] });
    expect(result.ok).toBe(false);
  });

  it("maps a native tool_calls response into ChatMessage.toolCalls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "main.py" } } }] },
        }),
      ),
    );
    const client = createOllamaClient({ model: "llama3.1" });
    const result = await client.chat({ messages: [{ role: "user", content: "read it" }] });

    expect(result).toEqual({
      ok: true,
      value: { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "main.py" } }] },
    });
  });

  it("omits toolCalls entirely for a plain-text response, not an empty array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: { content: "done" } })));
    const client = createOllamaClient({ model: "llama3.1" });
    const result = await client.chat({ messages: [] });

    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "done" } });
    if (result.ok) expect("toolCalls" in result.value).toBe(false);
  });

  it("passes request.tools through to the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOllamaClient({ model: "llama3.1" });
    await client.chat({
      messages: [],
      tools: [{ name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } }],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).tools).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });

  it("passes request.signal through to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createOllamaClient({ model: "llama3.1" });
    const controller = new AbortController();

    await client.chat({ messages: [], signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("returns an error Result when the request is aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")),
    );
    const client = createOllamaClient({ model: "llama3.1" });
    const controller = new AbortController();
    controller.abort();

    const result = await client.chat({ messages: [], signal: controller.signal });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(OllamaRequestError);
  });
});
