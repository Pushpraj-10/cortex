import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOllamaRequest,
  createOllamaClient,
  fromOllamaToolCalls,
  ollamaProviderDescriptor,
  toOllamaMessage,
} from "../src/ollama.js";
import { ProviderRequestError } from "../src/wire.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("toOllamaMessage", () => {
  it("maps role and content, dropping extra ChatMessage fields", () => {
    expect(toOllamaMessage({ role: "tool", content: "result", name: "search" })).toEqual({
      role: "tool",
      content: "result",
    });
  });

  it("forwards toolCalls into Ollama's tool_calls shape", () => {
    const mapped = toOllamaMessage({
      role: "assistant",
      content: "",
      toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }],
    });
    expect(mapped).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }],
    });
  });

  it("omits tool_calls when toolCalls is absent or empty", () => {
    expect(toOllamaMessage({ role: "user", content: "hi" })).toEqual({ role: "user", content: "hi" });
    expect(toOllamaMessage({ role: "assistant", content: "hi", toolCalls: [] })).toEqual({
      role: "assistant",
      content: "hi",
    });
  });
});

describe("fromOllamaToolCalls", () => {
  it("maps Ollama tool_calls to ToolCall[]", () => {
    const result = fromOllamaToolCalls([{ function: { name: "read_file", arguments: { path: "main.py" } } }]);
    expect(result).toEqual([{ toolName: "read_file", args: { path: "main.py" } }]);
  });

  it("returns undefined for an absent list", () => {
    expect(fromOllamaToolCalls(undefined)).toBeUndefined();
  });

  it("returns undefined (not []) for an empty list", () => {
    expect(fromOllamaToolCalls([])).toBeUndefined();
  });
});

describe("buildOllamaRequest", () => {
  it("maps messages and sets stream to false", () => {
    const body = buildOllamaRequest({ model: "llama3.1" }, { messages: [{ role: "user", content: "hi" }] });
    expect(body).toEqual({
      model: "llama3.1",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      options: undefined,
    });
  });

  it("includes temperature in options when provided", () => {
    const body = buildOllamaRequest({ model: "llama3.1" }, { messages: [], temperature: 0.5 });
    expect(body.options).toEqual({ temperature: 0.5 });
  });

  it("omits tools from the body when the request has none", () => {
    expect(buildOllamaRequest({ model: "llama3.1" }, { messages: [] }).tools).toBeUndefined();
  });

  it("maps ToolSpec[] to Ollama's function-calling tool schema", () => {
    const body = buildOllamaRequest(
      { model: "llama3.1" },
      { messages: [], tools: [{ name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } }] },
    );
    expect(body.tools).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });

  it("forwards an assistant message's toolCalls into Ollama's tool_calls shape", () => {
    const body = buildOllamaRequest(
      { model: "llama3.1" },
      {
        messages: [
          { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
          { role: "tool", content: '{"success":true}' },
        ],
      },
    );
    expect(body.messages[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }],
    });
    expect(body.messages[1]).toEqual({ role: "tool", content: '{"success":true}' });
  });
});

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
    await createOllamaClient({ model: "llama3.1" }).chat({ messages: [] });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.anything());
  });

  it("returns an error Result on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    const result = await createOllamaClient({ model: "llama3.1" }).chat({ messages: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ProviderRequestError);
  });

  it("returns an error Result when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await createOllamaClient({ model: "llama3.1" }).chat({ messages: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ProviderRequestError);
  });

  it("returns an error Result when the response has no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const result = await createOllamaClient({ model: "llama3.1" }).chat({ messages: [] });
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
    const result = await createOllamaClient({ model: "llama3.1" }).chat({
      messages: [{ role: "user", content: "read it" }],
    });

    expect(result).toEqual({
      ok: true,
      value: { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "main.py" } }] },
    });
  });

  it("omits toolCalls entirely for a plain-text response, not an empty array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ message: { content: "done" } })));
    const result = await createOllamaClient({ model: "llama3.1" }).chat({ messages: [] });

    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "done" } });
    if (result.ok) expect("toolCalls" in result.value).toBe(false);
  });

  it("passes request.tools through to the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "ok" } }));
    vi.stubGlobal("fetch", fetchMock);
    await createOllamaClient({ model: "llama3.1" }).chat({
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
    const controller = new AbortController();

    await createOllamaClient({ model: "llama3.1" }).chat({ messages: [], signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it("returns an error Result when the request is aborted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")));
    const controller = new AbortController();
    controller.abort();

    const result = await createOllamaClient({ model: "llama3.1" }).chat({ messages: [], signal: controller.signal });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ProviderRequestError);
  });
});

describe("ollamaProviderDescriptor", () => {
  it("identifies itself and creates a client", () => {
    expect(ollamaProviderDescriptor.id).toBe("ollama");
    expect(typeof ollamaProviderDescriptor.createClient({ model: "m" }).chat).toBe("function");
  });
});
