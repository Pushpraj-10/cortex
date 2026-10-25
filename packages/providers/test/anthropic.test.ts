import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anthropicProviderDescriptor,
  buildAnthropicRequest,
  createAnthropicClient,
  fromAnthropicContent,
  toAnthropicMessages,
} from "../src/anthropic.js";
import { ProviderRequestError } from "../src/wire.js";

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
