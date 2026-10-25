import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOllamaRequest,
  createOllamaClient,
  fromOllamaToolCalls,
  ollamaProviderDescriptor,
  toFunctionTools,
  toOllamaMessage,
} from "../src/ollama.js";
import { ProviderRequestError } from "../src/wire.js";
import { collect, dribble, streamResponse } from "./support/stream-response.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("toFunctionTools", () => {
  it("maps ToolSpec[] to the function-calling schema", () => {
    expect(toFunctionTools([{ name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } }])).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });

  it("maps an empty list to an empty list", () => {
    expect(toFunctionTools([])).toEqual([]);
  });
});

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

describe("createOllamaClient chatStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ndjson = (...chunks: object[]) => chunks.map((chunk) => `${JSON.stringify(chunk)}\n`).join("");
  const request = { messages: [{ role: "user" as const, content: "hi" }] };
  const stream = (response: Response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    return createOllamaClient({ model: "llama3.1" }).chatStream!(request);
  };

  it("yields each piece of text as it arrives, then the whole message", async () => {
    const events = await collect(
      stream(streamResponse([ndjson({ message: { content: "Hel" }, done: false }, { message: { content: "lo" }, done: false }, { message: { content: "" }, done: true })])),
    );
    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo" },
      { type: "done", message: { role: "assistant", content: "Hello" } },
    ]);
  });

  it("gives the same events however the network splits the lines", async () => {
    const text = ndjson({ message: { content: "Hel" }, done: false }, { message: { content: "lo" }, done: false }, { done: true });
    const whole = await collect(stream(streamResponse([text])));
    const dribbled = await collect(stream(streamResponse(dribble(text))));
    expect(dribbled).toEqual(whole);
    expect(whole[whole.length - 1]).toEqual({ type: "done", message: { role: "assistant", content: "Hello" } });
  });

  it("collects a tool call that arrives in a chunk of its own", async () => {
    const events = await collect(
      stream(
        streamResponse([
          ndjson(
            { message: { content: "Let me look." }, done: false },
            { message: { content: "", tool_calls: [{ function: { name: "read_file", arguments: { path: "a.ts" } } }] }, done: false },
            { message: { content: "" }, done: true },
          ),
        ]),
      ),
    );
    expect(events[events.length - 1]).toEqual({
      type: "done",
      message: { role: "assistant", content: "Let me look.", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
    });
    expect(events.filter((event) => event.type === "text")).toEqual([{ type: "text", delta: "Let me look." }]);
  });

  it("keeps text carried by the final done line, and skips blank lines", async () => {
    const events = await collect(stream(streamResponse([`\n${ndjson({ message: { content: "a" }, done: false })}\n${ndjson({ message: { content: "!" }, done: true })}`])));
    expect(events).toEqual([
      { type: "text", delta: "a" },
      { type: "text", delta: "!" },
      { type: "done", message: { role: "assistant", content: "a!" } },
    ]);
  });

  it("asks for a stream: stream true at /api/chat, with the same messages and tools as a normal request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([ndjson({ done: true })]));
    vi.stubGlobal("fetch", fetchMock);
    await collect(
      createOllamaClient({ model: "llama3.1", baseUrl: "http://example.test" }).chatStream!({
        messages: [{ role: "user", content: "hello" }],
        tools: [{ name: "read_file", description: "Reads", parametersSchema: { type: "object" } }],
        temperature: 0.2,
      }),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://example.test/api/chat");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "llama3.1",
      messages: [{ role: "user", content: "hello" }],
      tools: [{ type: "function", function: { name: "read_file", description: "Reads", parameters: { type: "object" } } }],
      stream: true,
      options: { temperature: 0.2 },
    });
  });

  it("reports an HTTP error, an unreachable server and a server-side error line as one error event each", async () => {
    const refused = await collect(stream(new Response("boom", { status: 500 })));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ type: "error", error: expect.any(ProviderRequestError) });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const unreachable = await collect(createOllamaClient({ model: "m" }).chatStream!(request));
    expect(unreachable).toMatchObject([{ type: "error", error: { message: "Failed to reach Ollama at http://localhost:11434" } }]);

    const failed = await collect(stream(streamResponse([ndjson({ error: "model 'x' not found" })])));
    expect(failed).toMatchObject([{ type: "error", error: { message: "Ollama stream error: model 'x' not found" } }]);
  });

  it("does not present a stream that ended early as a finished answer", async () => {
    const events = await collect(stream(streamResponse([ndjson({ message: { content: "partial" }, done: false })])));
    expect(events).toMatchObject([{ type: "text", delta: "partial" }, { type: "error", error: { message: "Ollama stream ended before the reply was finished" } }]);
  });

  it("reports a reply that is not JSON", async () => {
    const events = await collect(stream(streamResponse(["this is not json\n"])));
    expect(events).toMatchObject([{ type: "error", error: { message: "Ollama sent a reply that is not valid JSON" } }]);
  });

  it("reports a connection that drops part-way", async () => {
    const events = await collect(stream(streamResponse([ndjson({ message: { content: "so" }, done: false })], { failAfter: new Error("connection reset") })));
    expect(events[0]).toEqual({ type: "text", delta: "so" });
    expect(events[1]).toMatchObject({ type: "error", error: { message: "Ollama stream was interrupted: connection reset" } });
  });

  it("stops with a cancelled error when the caller aborts mid-stream", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.enqueue(new TextEncoder().encode(ndjson({ message: { content: "one" }, done: false })));
        controller.signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));

    const events: unknown[] = [];
    for await (const event of createOllamaClient({ model: "m" }).chatStream!({ ...request, signal: controller.signal })) {
      events.push(event);
      if (events.length === 1) controller.abort();
    }
    expect(events[0]).toEqual({ type: "text", delta: "one" });
    expect(events[1]).toMatchObject({ type: "error", error: { message: "Ollama request was cancelled" } });
  });

  it("leaves the normal chat() request non-streaming", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: { content: "hi" } }));
    vi.stubGlobal("fetch", fetchMock);
    await createOllamaClient({ model: "m" }).chat(request);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string).stream).toBe(false);
  });
});
