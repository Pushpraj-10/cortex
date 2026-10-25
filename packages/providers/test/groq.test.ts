import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGroqRequest, createGroqClient, fromGroqToolCalls, groqProviderDescriptor, toGroqMessage } from "../src/groq.js";
import { ProviderRequestError } from "../src/wire.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("toGroqMessage", () => {
  it("maps a plain message without tool_calls or tool_call_id", () => {
    expect(toGroqMessage({ role: "user", content: "hello" })).toEqual({ role: "user", content: "hello" });
  });

  it("stringifies tool call arguments and synthesizes a matching id", () => {
    const mapped = toGroqMessage({
      role: "assistant",
      content: "",
      toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }],
    });
    expect(mapped.tool_calls).toEqual([
      { id: "call_read_file", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
    ]);
  });

  it("attaches a tool_call_id derived from name on a tool-result message", () => {
    const mapped = toGroqMessage({ role: "tool", name: "read_file", content: "file contents" });
    expect(mapped.tool_call_id).toBe("call_read_file");
  });
});

describe("fromGroqToolCalls", () => {
  it("returns undefined for an absent or empty list", () => {
    expect(fromGroqToolCalls(undefined)).toBeUndefined();
    expect(fromGroqToolCalls([])).toBeUndefined();
  });

  it("parses JSON-string arguments into objects", () => {
    const result = fromGroqToolCalls([{ function: { name: "read_file", arguments: '{"path":"a.ts"}' } }]);
    expect(result).toEqual([{ toolName: "read_file", args: { path: "a.ts" } }]);
  });
});

describe("buildGroqRequest", () => {
  const config = { apiKey: "key", model: "llama-3.1-8b-instant" };

  it("omits tools when the request has none", () => {
    const body = buildGroqRequest(config, { messages: [{ role: "user", content: "hi" }] });
    expect(body.tools).toBeUndefined();
    expect(body.model).toBe("llama-3.1-8b-instant");
  });

  it("includes mapped tools in function-calling schema when the request has some", () => {
    const body = buildGroqRequest(config, {
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "read_file", description: "Reads a file", parametersSchema: { type: "object" } }],
    });
    expect(body.tools).toEqual([
      { type: "function", function: { name: "read_file", description: "Reads a file", parameters: { type: "object" } } },
    ]);
  });
});

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
    expect(!result.ok && result.error).toBeInstanceOf(ProviderRequestError);
  });

  it("maps tool_calls in the reply into ChatMessage.toolCalls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: null, tool_calls: [{ function: { name: "read_file", arguments: '{"path":"a.ts"}' } }] } }],
        }),
      ),
    );
    const result = await createGroqClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(result).toEqual({
      ok: true,
      value: { role: "assistant", content: "", toolCalls: [{ toolName: "read_file", args: { path: "a.ts" } }] },
    });
  });

  it("returns an error Result when the response has no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ choices: [] })));
    const result = await createGroqClient({ apiKey: "k", model: "m" }).chat({ messages: [] });
    expect(result.ok).toBe(false);
  });
});

describe("groqProviderDescriptor", () => {
  it("identifies itself and creates a client", () => {
    expect(groqProviderDescriptor.id).toBe("groq");
    expect(typeof groqProviderDescriptor.createClient({ apiKey: "k", model: "m" }).chat).toBe("function");
  });
});
