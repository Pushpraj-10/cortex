import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError, postJson, postStream, readLines, readSseData, streamInterrupted } from "../src/wire.js";
import { collect, dribble, streamResponse } from "./support/stream-response.js";

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

describe("postStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const opts = { provider: "Test", baseUrl: "http://t", url: "http://t/x", body: { a: 1 } };

  it("posts JSON and hands back the reply's body to read as it arrives", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(["a\n", "b\n"]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postStream({ ...opts, headers: { authorization: "Bearer x" } });

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer x" });
    if (result.ok) expect(await collect(readLines(result.value))).toEqual(["a", "b"]);
  });

  it("folds a network failure and a non-2xx status into the same errors postJson gives", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const unreachable = await postStream(opts);
    expect(!unreachable.ok && unreachable.error.message).toBe("Failed to reach Test at http://t");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    const refused = await postStream(opts);
    expect(!refused.ok && refused.error.message).toBe("Test returned 503: nope");
    expect(!refused.ok && refused.error).toBeInstanceOf(ProviderRequestError);
  });

  it("reports a reply with no body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const result = await postStream(opts);
    expect(!result.ok && result.error.message).toBe("Test sent no response body");
  });
});

describe("readLines", () => {
  it("returns lines whole however the network cuts them", async () => {
    const lines = await collect(readLines(streamResponse(["one\ntw", "o\nthr", "ee\n"]).body!));
    expect(lines).toEqual(["one", "two", "three"]);
  });

  it("copes with one character per chunk", async () => {
    expect(await collect(readLines(streamResponse(dribble("alpha\nbeta\n")).body!))).toEqual(["alpha", "beta"]);
  });

  it("treats \r\n as one line break and keeps empty lines", async () => {
    expect(await collect(readLines(streamResponse(["a\r\n\r\nb\r\n"]).body!))).toEqual(["a", "", "b"]);
  });

  it("delivers a last line that has no line break", async () => {
    expect(await collect(readLines(streamResponse(["a\nlast"]).body!))).toEqual(["a", "last"]);
  });

  it("does not split a multi-byte character that arrives in two chunks", async () => {
    const bytes = new TextEncoder().encode("héllo wörld\n");
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
    const lines = await collect(readLines(streamResponse([bytes.slice(0, cut), bytes.slice(cut)]).body!));
    expect(lines).toEqual(["héllo wörld"]);
  });

  it("is empty for an empty body", async () => {
    expect(await collect(readLines(streamResponse([]).body!))).toEqual([]);
  });

  it("closes the connection when the reader stops early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("a\nb\nc\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const line of readLines(body)) {
      expect(line).toBe("a");
      break;
    }
    expect(cancelled).toBe(true);
  });

  it("throws what the stream throws, so the caller can report a dropped connection", async () => {
    const dropped = streamResponse(["a\n"], { failAfter: new Error("connection reset") }).body!;
    await expect(collect(readLines(dropped))).rejects.toThrow("connection reset");
  });
});

describe("readSseData", () => {
  it("yields the data of each event, ending an event at the blank line", async () => {
    const events = await collect(readSseData(streamResponse(["data: {\"a\":1}\n\ndata: {\"b\":2}\n\n"]).body!));
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("joins the data lines of one event with newlines", async () => {
    expect(await collect(readSseData(streamResponse(["data: one\ndata: two\n\n"]).body!))).toEqual(["one\ntwo"]);
  });

  it("ignores event names, ids and comments", async () => {
    const text = ": keep-alive\nevent: content_block_delta\nid: 7\ndata: payload\n\n";
    expect(await collect(readSseData(streamResponse([text]).body!))).toEqual(["payload"]);
  });

  it("accepts data with no space after the colon, and an event with no final blank line", async () => {
    expect(await collect(readSseData(streamResponse(["data:x\n\ndata: tail"]).body!))).toEqual(["x", "tail"]);
  });

  it("reassembles events from one character per chunk", async () => {
    const text = "event: a\ndata: first\n\nevent: b\ndata: second\n\n";
    expect(await collect(readSseData(streamResponse(dribble(text)).body!))).toEqual(["first", "second"]);
  });

  it("does not produce an event from blank lines alone", async () => {
    expect(await collect(readSseData(streamResponse(["\n\n\n"]).body!))).toEqual([]);
  });
});

describe("streamInterrupted", () => {
  it("says a cancelled request was cancelled", () => {
    const error = streamInterrupted("Test", new DOMException("aborted", "AbortError"));
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.message).toBe("Test request was cancelled");
  });

  it("says a broken stream was interrupted, with the reason", () => {
    expect(streamInterrupted("Test", new Error("connection reset")).message).toBe("Test stream was interrupted: connection reset");
    expect(streamInterrupted("Test", "plain text").message).toBe("Test stream was interrupted: plain text");
  });

  it("keeps the original error as the cause", () => {
    const cause = new Error("root");
    expect(streamInterrupted("Test", cause).cause).toBe(cause);
  });
});
