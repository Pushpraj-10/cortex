import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anthropicProviderDescriptor,
  buildAnthropicRequest,
  createAnthropicClient,
  fromAnthropicContent,
  toAnthropicMessages,
} from "../src/anthropic.js";
import { ProviderRequestError } from "../src/wire.js";
import { collect, dribble, streamResponse } from "./support/stream-response.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("toAnthropicMessages", () => {
  it("lifts system messages into the top-level system string", () => {
    const out = toAnthropicMessages([
      { role: "system", content: "be brief" },
      { role: "system", content: "be kind" },
      { role: "user", content: "hi" },
    ]);
    expect(out.system).toBe("be brief\n\nbe kind");
    expect(out.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
  });

  it("leaves system undefined when there are no system messages", () => {
    expect(toAnthropicMessages([{ role: "user", content: "hi" }]).system).toBeUndefined();
  });

  it("maps assistant tool calls to tool_use blocks and tool results to tool_result blocks", () => {
    const { messages } = toAnthropicMessages([
      { role: "user", content: "read it" },
      { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
      { role: "tool", name: "read_file", content: "contents" },
    ]);
    expect(messages).toEqual([
      { role: "user", content: [{ type: "text", text: "read it" }] },
      { role: "assistant", content: [{ type: "tool_use", id: "call_read_file", name: "read_file", input: { path: "a.ts" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_read_file", content: "contents" }] },
    ]);
  });

  it("merges a trailing user message into the tool-result turn, keeping tool_result first", () => {
    const { messages } = toAnthropicMessages([
      { role: "assistant", content: "", toolCalls: [{ toolName: "t", args: {} }] },
      { role: "tool", name: "t", content: "r" },
      { role: "user", content: "context block" },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[1]!.content.map((b) => b.type)).toEqual(["tool_result", "text"]);
  });

  it("drops empty-content messages instead of sending empty text blocks", () => {
    expect(toAnthropicMessages([{ role: "user", content: "" }, { role: "assistant", content: "" }]).messages).toEqual([]);
  });

  it("keeps assistant text alongside its tool_use block", () => {
    const { messages } = toAnthropicMessages([
      { role: "assistant", content: "reading", toolCalls: [{ toolName: "t", args: {} }] },
    ]);
    expect(messages[0]!.content.map((b) => b.type)).toEqual(["text", "tool_use"]);
  });
});

describe("buildAnthropicRequest", () => {
  const config = { apiKey: "k", model: "claude-test" };

  it("sets model, default max_tokens and omits tools/tool_choice when no tools are given", () => {
    const body = buildAnthropicRequest(config, { messages: [{ role: "user", content: "hi" }] });
    expect(body.model).toBe("claude-test");
    expect(body.max_tokens).toBe(8192);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("maps tools to input_schema and disables parallel tool use", () => {
    const body = buildAnthropicRequest(
      { ...config, maxTokens: 100 },
      { messages: [], tools: [{ name: "read_file", description: "Reads", parametersSchema: { type: "object" } }] },
    );
    expect(body.max_tokens).toBe(100);
    expect(body.tools).toEqual([{ name: "read_file", description: "Reads", input_schema: { type: "object" } }]);
    expect(body.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
  });
});

describe("fromAnthropicContent", () => {
  it("joins text blocks", () => {
    expect(fromAnthropicContent([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toEqual({ content: "a\nb" });
  });

  it("returns only the first tool_use as a ToolCall", () => {
    const out = fromAnthropicContent([
      { type: "tool_use", id: "1", name: "first", input: { x: 1 } },
      { type: "tool_use", id: "2", name: "second", input: {} },
    ]);
    expect(out).toEqual({ content: "", toolCalls: [{ toolName: "first", args: { x: 1 } }] });
  });
});

describe("createAnthropicClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /v1/messages with the api key and version headers and returns the reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "text", text: "hello" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = createAnthropicClient({ apiKey: "secret", model: "m", baseUrl: "http://example.test" });

    const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "hello" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://example.test/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("maps a tool_use reply into toolCalls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ content: [{ type: "tool_use", id: "x", name: "read_file", input: { path: "a" } }] })),
    );
    const result = await createAnthropicClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(result).toEqual({
      ok: true,
      value: { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a" } }] },
    });
  });

  it("returns an error Result on a non-ok response and when content is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "bad" }, 401)));
    const failed = await createAnthropicClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(!failed.ok && failed.error).toBeInstanceOf(ProviderRequestError);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const empty = await createAnthropicClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(empty.ok).toBe(false);
  });
});

describe("anthropicProviderDescriptor", () => {
  it("identifies itself and creates a client", () => {
    expect(anthropicProviderDescriptor.id).toBe("anthropic");
    expect(typeof anthropicProviderDescriptor.createClient({ apiKey: "k", model: "m" }).chat).toBe("function");
  });
});

describe("createAnthropicClient chatStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sse = (name: string, payload: object) => `event: ${name}\ndata: ${JSON.stringify({ type: name, ...payload })}\n\n`;
  const start = sse("message_start", { message: { id: "msg_1", role: "assistant", content: [] } }) + sse("ping", {});
  const textBlock = (index: number, ...pieces: string[]) =>
    sse("content_block_start", { index, content_block: { type: "text", text: "" } }) +
    pieces.map((text) => sse("content_block_delta", { index, delta: { type: "text_delta", text } })).join("") +
    sse("content_block_stop", { index });
  const toolBlock = (index: number, name: string, ...json: string[]) =>
    sse("content_block_start", { index, content_block: { type: "tool_use", id: `toolu_${index}`, name, input: {} } }) +
    json.map((partial_json) => sse("content_block_delta", { index, delta: { type: "input_json_delta", partial_json } })).join("") +
    sse("content_block_stop", { index });
  const stop = sse("message_delta", { delta: { stop_reason: "end_turn" } }) + sse("message_stop", {});

  const request = { messages: [{ role: "user" as const, content: "hi" }] };
  const config = { apiKey: "key-1", model: "claude-test" };
  const stream = (response: Response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    return createAnthropicClient(config).chatStream!(request);
  };

  it("yields each piece of text as it is written, then the whole message", async () => {
    const events = await collect(stream(streamResponse([start + textBlock(0, "Hello", " wor", "ld") + stop])));
    expect(events).toEqual([
      { type: "text", delta: "Hello" },
      { type: "text", delta: " wor" },
      { type: "text", delta: "ld" },
      { type: "done", message: { role: "assistant", content: "Hello world" } },
    ]);
  });

  it("gives the same events however the network splits the stream", async () => {
    const text = start + textBlock(0, "Hel", "lo") + stop;
    expect(await collect(stream(streamResponse(dribble(text))))).toEqual(await collect(stream(streamResponse([text]))));
  });

  it("assembles a tool call from JSON fragments, without showing them as text", async () => {
    const events = await collect(stream(streamResponse([start + textBlock(0, "Let me check.") + toolBlock(1, "read_file", '{"pa', 'th": "a.', 'ts"}') + stop])));
    expect(events.filter((event) => event.type === "text")).toEqual([{ type: "text", delta: "Let me check." }]);
    expect(events[events.length - 1]).toEqual({
      type: "done",
      message: { role: "assistant", content: "Let me check.", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
    });
  });

  it("treats a tool call with no arguments as an empty object", async () => {
    const events = await collect(stream(streamResponse([start + toolBlock(0, "list_all") + stop])));
    expect(events).toEqual([{ type: "done", message: { role: "assistant", content: "", toolCalls: [{ toolName: "list_all", args: {} }] } }]);
  });

  it("joins separate text blocks with a newline in the final message, as a whole reply is joined", async () => {
    const events = await collect(stream(streamResponse([start + textBlock(0, "a") + textBlock(1, "b") + stop])));
    expect(events[events.length - 1]).toEqual({ type: "done", message: { role: "assistant", content: "a\nb" } });
  });

  it("ignores a thinking block", async () => {
    const thinking =
      sse("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }) +
      sse("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }) +
      sse("content_block_stop", { index: 0 });
    const events = await collect(stream(streamResponse([start + thinking + textBlock(1, "Answer") + stop])));
    expect(events).toEqual([
      { type: "text", delta: "Answer" },
      { type: "done", message: { role: "assistant", content: "Answer" } },
    ]);
  });

  it("asks for a stream with the same body as a normal request, and the key and version in headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([start + textBlock(0, "x") + stop]));
    vi.stubGlobal("fetch", fetchMock);
    await collect(createAnthropicClient({ ...config, baseUrl: "http://example.test" }).chatStream!(request));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://example.test/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "key-1", "anthropic-version": "2023-06-01" });
    expect(JSON.parse(init.body as string)).toEqual(JSON.parse(JSON.stringify({ ...buildAnthropicRequest(config, request), stream: true })));
  });

  it("reports an HTTP error, an unreachable server, an error event and a reply that is not JSON as one error event each", async () => {
    const refused = await collect(stream(new Response("unauthorized", { status: 401 })));
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ type: "error", error: expect.any(ProviderRequestError) });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await collect(createAnthropicClient(config).chatStream!(request))).toMatchObject([{ type: "error", error: { message: expect.stringContaining("Failed to reach Anthropic") } }]);

    const overloaded = await collect(stream(streamResponse([start + sse("error", { error: { type: "overloaded_error", message: "Overloaded" } })])));
    expect(overloaded).toMatchObject([{ type: "error", error: { message: "Anthropic stream error: Overloaded" } }]);

    const garbage = await collect(stream(streamResponse(["data: not json\n\n"])));
    expect(garbage).toMatchObject([{ type: "error", error: { message: "Anthropic sent a reply that is not valid JSON" } }]);
  });

  it("does not present a stream that ended before message_stop as a finished answer", async () => {
    const events = await collect(stream(streamResponse([start + textBlock(0, "partial")])));
    expect(events).toMatchObject([{ type: "text", delta: "partial" }, { type: "error", error: { message: "Anthropic stream ended before the reply was finished" } }]);
  });

  it("reports tool arguments that are not valid JSON", async () => {
    const events = await collect(stream(streamResponse([start + toolBlock(0, "read_file", '{"path": ') + stop])));
    expect(events).toMatchObject([{ type: "error", error: { message: expect.stringContaining("arguments for read_file that are not valid JSON") } }]);
  });

  it("reports a connection that drops part-way, and a cancelled request", async () => {
    const dropped = await collect(stream(streamResponse([start + textBlock(0, "so")], { failAfter: new Error("connection reset") })));
    expect(dropped[dropped.length - 1]).toMatchObject({ type: "error", error: { message: "Anthropic stream was interrupted: connection reset" } });

    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(readable) {
        readable.enqueue(new TextEncoder().encode(start + textBlock(0, "one")));
        controller.signal.addEventListener("abort", () => readable.error(new DOMException("aborted", "AbortError")));
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    const events: { type: string }[] = [];
    for await (const event of createAnthropicClient(config).chatStream!({ ...request, signal: controller.signal })) {
      events.push(event);
      if (event.type === "text") controller.abort();
    }
    expect(events[events.length - 1]).toMatchObject({ type: "error", error: { message: "Anthropic request was cancelled" } });
  });
});
