import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleRequest,
  createGoogleClient,
  fromGoogleParts,
  googleProviderDescriptor,
  toGoogleContents,
} from "../src/google.js";
import { ProviderRequestError } from "../src/wire.js";

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
});

describe("createGoogleClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const reply = (parts: unknown[]) => jsonResponse({ candidates: [{ content: { role: "model", parts } }] });

  it("posts to the model's generateContent URL with the api key header and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply([{ text: "hello" }]));
    vi.stubGlobal("fetch", fetchMock);
    const client = createGoogleClient({ apiKey: "secret", model: "gemini-test", baseUrl: "http://example.test" });

    const result = await client.chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toEqual({ ok: true, value: { role: "assistant", content: "hello" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://example.test/v1beta/models/gemini-test:generateContent");
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
