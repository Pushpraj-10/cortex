import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleRequest,
  createGoogleClient,
  fromGoogleParts,
  googleProviderDescriptor,
  listGoogleModels,
  toGoogleContents,
} from "../src/google.js";
import { ProviderRequestError } from "../src/wire.js";
import { collect, dribble, streamResponse } from "./support/stream-response.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("toGoogleContents", () => {
  it("lifts system messages into one systemInstruction string", () => {
    const out = toGoogleContents([
      { role: "system", content: "be brief" },
      { role: "system", content: "be kind" },
      { role: "user", content: "hi" },
    ]);
    expect(out.systemInstruction).toBe("be brief\n\nbe kind");
    expect(out.contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
  });

  it("leaves systemInstruction undefined when there are no system messages", () => {
    expect(toGoogleContents([{ role: "user", content: "hi" }]).systemInstruction).toBeUndefined();
  });

  it("maps assistant turns to the model role, with functionCall parts for tool calls", () => {
    const { contents } = toGoogleContents([
      { role: "assistant", content: "reading", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
    ]);
    expect(contents).toEqual([
      { role: "model", parts: [{ text: "reading" }, { functionCall: { name: "read_file", args: { path: "a.ts" } } }] },
    ]);
  });

  it("maps a tool result to a functionResponse part matched by name, parsing the JSON content", () => {
    const { contents } = toGoogleContents([{ role: "tool", name: "read_file", content: '{"content":"hello"}' }]);
    expect(contents).toEqual([
      { role: "user", parts: [{ functionResponse: { name: "read_file", response: { content: "hello" } } }] },
    ]);
  });

  it("wraps a non-object or non-JSON tool result, because Gemini requires an object", () => {
    const wrap = (content: string) =>
      (toGoogleContents([{ role: "tool", name: "t", content }]).contents[0]!.parts[0] as { functionResponse: { response: unknown } })
        .functionResponse.response;
    expect(wrap("3")).toEqual({ result: 3 });
    expect(wrap("[1,2]")).toEqual({ result: [1, 2] });
    expect(wrap("plain text")).toEqual({ result: "plain text" });
  });

  it("merges a trailing user message into the tool-result turn, keeping the functionResponse first", () => {
    const { contents } = toGoogleContents([
      { role: "assistant", content: "", toolCalls: [{ toolName: "t", args: {} }] },
      { role: "tool", name: "t", content: "{}" },
      { role: "user", content: "context block" },
    ]);
    expect(contents).toHaveLength(2);
    expect(contents[1]!.parts.map((p) => Object.keys(p)[0])).toEqual(["functionResponse", "text"]);
  });

  it("drops messages with no content instead of sending empty parts", () => {
    expect(toGoogleContents([{ role: "user", content: "" }, { role: "assistant", content: "" }]).contents).toEqual([]);
  });
});

describe("buildGoogleRequest", () => {
  it("includes the system instruction and contents, and omits tools and generationConfig by default", () => {
    const body = buildGoogleRequest({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }] });
    expect(body.systemInstruction).toEqual({ parts: [{ text: "sys" }] });
    expect(body.contents).toHaveLength(1);
    expect(body.tools).toBeUndefined();
    expect(body.generationConfig).toBeUndefined();
  });

  it("maps tools to functionDeclarations and passes temperature", () => {
    const body = buildGoogleRequest({
      messages: [],
      temperature: 0.3,
      tools: [{ name: "read_file", description: "Reads", parametersSchema: { type: "object", properties: { path: { type: "string" } } } }],
    });
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          { name: "read_file", description: "Reads", parameters: { type: "object", properties: { path: { type: "string" } } } },
        ],
      },
    ]);
    expect(body.generationConfig).toEqual({ temperature: 0.3 });
  });

  it("omits parameters for a tool with no properties, which Gemini would reject", () => {
    const body = buildGoogleRequest({
      messages: [],
      tools: [{ name: "ping", description: "No args", parametersSchema: { type: "object", properties: {} } }],
    });
    expect(body.tools![0]!.functionDeclarations[0]).toEqual({ name: "ping", description: "No args" });
  });

  it("strips the schema keywords Gemini does not accept, at every depth", () => {
    const body = buildGoogleRequest({
      messages: [],
      tools: [
        {
          name: "t",
          description: "",
          parametersSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            additionalProperties: false,
            properties: { nested: { type: "object", additionalProperties: true, properties: { a: { type: "string" } } } },
          },
        },
      ],
    });
    expect(body.tools![0]!.functionDeclarations[0]!.parameters).toEqual({
      type: "object",
      properties: { nested: { type: "object", properties: { a: { type: "string" } } } },
    });
  });
});

describe("fromGoogleParts", () => {
  it("joins visible text and ignores thought parts", () => {
    expect(fromGoogleParts([{ text: "a" }, { text: "hidden", thought: true }, { text: "b" }])).toEqual({ content: "a\nb" });
  });

  it("returns only the first functionCall as a ToolCall", () => {
    const out = fromGoogleParts([
      { functionCall: { name: "first", args: { x: 1 } } },
      { functionCall: { name: "second", args: {} } },
    ]);
    expect(out).toEqual({ content: "", toolCalls: [{ toolName: "first", args: { x: 1 } }] });
  });

  it("keeps the functionCall's thoughtSignature on the ToolCall", () => {
    const out = fromGoogleParts([{ functionCall: { name: "first", args: {} }, thoughtSignature: "sig" }]);
    expect(out.toolCalls).toEqual([{ toolName: "first", args: {}, thoughtSignature: "sig" }]);
  });

  it("echoes a ToolCall's thoughtSignature back on the replayed functionCall part", () => {
    const { contents } = toGoogleContents([
      { role: "assistant", content: "", toolCalls: [{ toolName: "find_files", args: {}, thoughtSignature: "sig" }] },
    ]);
    expect(contents).toEqual([
      { role: "model", parts: [{ functionCall: { name: "find_files", args: {} }, thoughtSignature: "sig" }] },
    ]);
  });
});

describe("createGoogleClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reply = (parts: unknown[]) => jsonResponse({ candidates: [{ content: { role: "model", parts } }] });

  it("posts to the model's generateContent URL with the api key header and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply([{ text: "hello" }]));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGoogleClient({ apiKey: "secret", model: "gemini-test", baseUrl: "https://example.test" });

    const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "hello" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1beta/models/gemini-test:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
    expect(JSON.parse(init.body as string).contents).toEqual([{ role: "user", parts: [{ text: "hi" }] }]);
  });

  it("accepts a model written as models/<name>", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply([{ text: "x" }]));
    vi.stubGlobal("fetch", fetchMock);
    await createGoogleClient({ apiKey: "k", model: "models/gemini-test" }).chat({ messages: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  });

  it("maps a functionCall reply into toolCalls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([{ functionCall: { name: "read_file", args: { path: "a" } } }])));
    const result = await createGoogleClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(result).toEqual({
      ok: true,
      value: { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a" } }] },
    });
  });

  it("returns an error Result on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad key" }, 403)));
    const result = await createGoogleClient({ apiKey: "bad", model: "m" }).chat({ messages: [] });
    expect(!result.ok && result.error).toBeInstanceOf(ProviderRequestError);
  });

  it("explains a blocked prompt or an empty candidate instead of returning empty text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ promptFeedback: { blockReason: "SAFETY" } })));
    const blocked = await createGoogleClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(!blocked.ok && blocked.error.message).toBe("Google response had no content (blocked: SAFETY)");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ candidates: [{ finishReason: "MAX_TOKENS" }] })));
    const empty = await createGoogleClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(!empty.ok && empty.error.message).toBe("Google response had no content (finish reason: MAX_TOKENS)");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const nothing = await createGoogleClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(!nothing.ok && nothing.error.message).toBe("Google response had no content");
  });
});

describe("googleProviderDescriptor", () => {
  it("identifies itself and creates a client", () => {
    expect(googleProviderDescriptor.id).toBe("google");
    expect(typeof googleProviderDescriptor.createClient({ apiKey: "k", model: "m" }).chat).toBe("function");
  });
});

describe("createGoogleClient chatStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sse = (...chunks: object[]) => chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join("");
  const parts = (...p: object[]) => ({ candidates: [{ content: { role: "model", parts: p } }] });
  const request = { messages: [{ role: "user" as const, content: "hi" }] };
  const config = { apiKey: "key-1", model: "gemini-test" };
  const stream = (response: Response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    return createGoogleClient(config).chatStream!(request);
  };

  it("yields each piece of text as it arrives, and a message whose text is the pieces joined without a separator", async () => {
    const events = await collect(stream(streamResponse([sse(parts({ text: "Hel" }), parts({ text: "lo wor" }), { ...parts({ text: "ld" }), candidates: [{ content: { role: "model", parts: [{ text: "ld" }] }, finishReason: "STOP" }] })])));
    expect(events).toEqual([
      { type: "text", delta: "Hel" },
      { type: "text", delta: "lo wor" },
      { type: "text", delta: "ld" },
      { type: "done", message: { role: "assistant", content: "Hello world" } },
    ]);
  });

  it("gives the same events however the network splits the stream", async () => {
    const text = sse(parts({ text: "Hel" }), parts({ text: "lo" }));
    expect(await collect(stream(streamResponse(dribble(text))))).toEqual(await collect(stream(streamResponse([text]))));
  });

  it("hides thought parts, from the pieces and from the message", async () => {
    const events = await collect(stream(streamResponse([sse(parts({ text: "pondering...", thought: true }), parts({ text: "Answer" }))])));
    expect(events).toEqual([
      { type: "text", delta: "Answer" },
      { type: "done", message: { role: "assistant", content: "Answer" } },
    ]);
  });

  it("returns a function call as the message's tool call, and only the first when it asks for several", async () => {
    const events = await collect(
      stream(
        streamResponse([
          sse(parts({ text: "Checking." }), parts({ functionCall: { name: "read_file", args: { path: "a.ts" } } }, { functionCall: { name: "read_file", args: { path: "b.ts" } } })),
        ]),
      ),
    );
    expect(events[events.length - 1]).toEqual({
      type: "done",
      message: { role: "assistant", content: "Checking.", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
    });
  });

  it("asks for a server-sent-event stream with the same body as a normal request, and the API key in a header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([sse(parts({ text: "x" }))]));
    vi.stubGlobal("fetch", fetchMock);
    await collect(createGoogleClient({ ...config, model: "models/gemini-test" }).chatStream!(request));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("key-1");
    expect(JSON.parse(init.body as string)).toEqual(buildGoogleRequest(request));
  });

  it("reports a stream with no content, saying why when Google did", async () => {
    const blocked = await collect(stream(streamResponse([sse({ promptFeedback: { blockReason: "SAFETY" } })])));
    expect(blocked).toMatchObject([{ type: "error", error: { message: "Google response had no content (blocked: SAFETY)" } }]);

    const empty = await collect(stream(streamResponse([sse({ candidates: [{ finishReason: "MAX_TOKENS" }] })])));
    expect(empty).toMatchObject([{ type: "error", error: { message: "Google response had no content (finish reason: MAX_TOKENS)" } }]);
  });

  it("reports an HTTP error, an unreachable server, an error event and a reply that is not JSON as one error event each", async () => {
    const refused = await collect(stream(new Response('{"error":{"code":404}}', { status: 404 })));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ type: "error", error: expect.any(ProviderRequestError) });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await collect(createGoogleClient(config).chatStream!(request))).toMatchObject([{ type: "error", error: { message: expect.stringContaining("Failed to reach Google") } }]);

    const failed = await collect(stream(streamResponse([sse({ error: { message: "quota exceeded" } })])));
    expect(failed).toMatchObject([{ type: "error", error: { message: "Google stream error: quota exceeded" } }]);

    const garbage = await collect(stream(streamResponse(["data: not json\n\n"])));
    expect(garbage).toMatchObject([{ type: "error", error: { message: "Google sent a reply that is not valid JSON" } }]);
  });

  it("reports a connection that drops part-way, after the text already shown", async () => {
    const events = await collect(stream(streamResponse([sse(parts({ text: "so" }))], { failAfter: new Error("connection reset") })));
    expect(events[0]).toEqual({ type: "text", delta: "so" });
    expect(events[1]).toMatchObject({ type: "error", error: { message: "Google stream was interrupted: connection reset" } });
  });

  it("stops with a cancelled error when the caller aborts mid-stream", async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(readable) {
        readable.enqueue(new TextEncoder().encode(sse(parts({ text: "one" }))));
        controller.signal.addEventListener("abort", () => readable.error(new DOMException("aborted", "AbortError")));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));

    const events: unknown[] = [];
    for await (const event of createGoogleClient(config).chatStream!({ ...request, signal: controller.signal })) {
      events.push(event);
      if (events.length === 1) controller.abort();
    }
    expect(events[1]).toMatchObject({ type: "error", error: { message: "Google request was cancelled" } });
  });
});

describe("listGoogleModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const GENERATE = ["generateContent", "countTokens"];
  const model = (name: string, methods = GENERATE, displayName?: string) => ({ name: `models/${name}`, displayName, supportedGenerationMethods: methods });

  it("asks /v1beta/models with the key in a header (not the URL), and strips the models/ prefix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ models: [model("gemini-2.5-pro", GENERATE, "Gemini 2.5 Pro"), model("gemini-2.5-flash")] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleModels({ apiKey: "AIza-SECRET" });

    expect(result).toEqual({ ok: true, value: [{ id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro" }, { id: "gemini-2.5-flash" }] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000");
    expect(url).not.toContain("AIza-SECRET");
    expect(init.headers).toEqual({ "x-goog-api-key": "AIza-SECRET" });
  });

  it("keeps only the models that can chat: generateContent, and not speech, image or embedding models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          models: [
            model("gemini-2.5-flash"),
            model("gemini-2.0-flash-lite"),
            model("gemini-embedding-001", ["embedContent"]),
            model("imagen-4.0-generate-001", ["predict"]),
            model("aqa", ["generateAnswer"]),
            model("gemini-2.5-flash-preview-tts"),
            model("gemini-2.5-flash-image"),
            model("gemini-live-2.5-flash", ["bidiGenerateContent"]),
          ],
        }),
      ),
    );

    const result = await listGoogleModels({ apiKey: "k" });

    expect(result.ok && result.value.map((m) => m.id)).toEqual(["gemini-2.5-flash", "gemini-2.0-flash-lite"]);
  });

  it("follows page tokens until there is none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ models: [model("gemini-a")], nextPageToken: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ models: [model("gemini-b")] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleModels({ apiKey: "k", baseUrl: "https://proxy.test" });

    expect(result.ok && result.value.map((m) => m.id)).toEqual(["gemini-a", "gemini-b"]);
    expect(fetchMock.mock.calls[1]![0]).toBe("https://proxy.test/v1beta/models?pageSize=1000&pageToken=tok");
  });

  it("returns an empty list, not an error, when there are no models", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    expect(await listGoogleModels({ apiKey: "k" })).toEqual({ ok: true, value: [] });
  });

  it("reports a rejected key with the API's status, and never repeats the key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "API key not valid." } }, 400)));

    const result = await listGoogleModels({ apiKey: "AIza-SECRET" });

    expect(!result.ok && result.error).toBeInstanceOf(ProviderRequestError);
    expect(!result.ok && result.error.message).toContain("Google returned 400");
    expect(!result.ok && result.error.message).not.toContain("AIza-SECRET");
  });

  it("is what the descriptor lists models with", () => {
    expect(googleProviderDescriptor.listModels).toBe(listGoogleModels);
  });
});

describe("Google: where the key may go", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const request = { messages: [{ role: "user" as const, content: "hi" }] };
  const reply = () => jsonResponse({ candidates: [{ content: { parts: [{ text: "hello" }] } }] });

  it("never sends the key over plain http to another machine, for a chat, a stream or a model list", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply());
    vi.stubGlobal("fetch", fetchMock);
    const baseUrl = "http://gateway.example:8080";
    const client = createGoogleClient({ apiKey: "AIza-SECRET", model: "gemini-test", baseUrl });

    const chat = await client.chat(request);
    const events = await collect(client.chatStream!(request));
    const listed = await listGoogleModels({ apiKey: "AIza-SECRET", baseUrl });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(!chat.ok && chat.error.message).toContain("Google would send its API key to gateway.example over plain http");
    expect(events).toEqual([{ type: "error", error: expect.objectContaining({ message: expect.stringContaining("over plain http") }) }]);
    expect(!listed.ok && listed.error.message).toContain("over plain http");
    for (const message of [!chat.ok && chat.error.message, !listed.ok && listed.error.message]) expect(message).not.toContain("AIza-SECRET");
  });

  it("still works over plain http to this machine, for a local gateway", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => reply());
    vi.stubGlobal("fetch", fetchMock);

    const chat = await createGoogleClient({ apiKey: "k", model: "gemini-test", baseUrl: "http://127.0.0.1:4000" }).chat(request);

    expect(chat.ok && chat.value.content).toBe("hello");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://127.0.0.1:4000/v1beta/models/gemini-test:generateContent");
  });

  it("does not follow a redirect with the key attached, and says so", async () => {
    const fetchMock = vi.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: new Error("unexpected redirect") }));
    vi.stubGlobal("fetch", fetchMock);

    const chat = await createGoogleClient({ apiKey: "k", model: "gemini-test" }).chat(request);

    expect((fetchMock.mock.calls[0]![1] as RequestInit).redirect).toBe("error");
    expect(!chat.ok && chat.error.message).toContain("redirected the request; it is not followed");
  });
});
