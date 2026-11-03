import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError, checkRequestUrl, getJson, postJson, postStream, readLines, readSseData, streamInterrupted } from "../src/wire.js";
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

describe("getJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const opts = { provider: "Test", baseUrl: "http://t", url: "http://t/models" };

  /** A fetch that never answers on its own and fails the way the real one does when its signal aborts. */
  const hangingFetch = () =>
    vi.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      });
    });

  it("GETs with the given headers and returns the parsed reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getJson<{ ok: number }>({ ...opts, headers: { "x-api-key": "k" } });

    expect(result).toEqual({ ok: true, value: { ok: 1 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://t/models");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "x-api-key": "k" });
    expect(init.body).toBeUndefined();
  });

  it("folds a network failure into a ProviderRequestError naming the base URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const result = await getJson(opts);
    expect(!result.ok && result.error).toBeInstanceOf(ProviderRequestError);
    expect(!result.ok && result.error.message).toBe("Failed to reach Test at http://t");
  });

  it("folds a non-2xx status into a ProviderRequestError with the status and body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad key", { status: 401 })));
    const result = await getJson(opts);
    expect(!result.ok && result.error.message).toBe("Test returned 401: bad key");
  });

  it("folds a reply that is not JSON into a ProviderRequestError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy</html>")));
    const result = await getJson(opts);
    expect(!result.ok && result.error.message).toBe("Test sent a reply that is not valid JSON");
  });

  it("gives up on a server that never answers, and says it was the wait", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const result = await getJson({ ...opts, timeoutMs: 20 });
    expect(!result.ok && result.error.message).toBe("Test at http://t did not answer in time");
  });

  it("stops when the caller cancels, without calling that a timeout", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const controller = new AbortController();
    const pending = getJson({ ...opts, signal: controller.signal });
    controller.abort();
    const result = await pending;
    expect(!result.ok && result.error.message).toBe("Failed to reach Test at http://t");
  });

  it("never puts the headers, and so an API key, in an error", async () => {
    const headers = { "x-api-key": "SECRET-KEY-123" };
    for (const failing of [
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      vi.fn().mockResolvedValue(new Response("nope", { status: 403 })),
      vi.fn().mockResolvedValue(new Response("not json")),
      hangingFetch(),
    ]) {
      vi.stubGlobal("fetch", failing);
      const result = await getJson({ ...opts, headers, timeoutMs: 20 });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.message).not.toContain("SECRET-KEY-123");
    }
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

describe("checkRequestUrl", () => {
  const check = (url: string, secure = true) => checkRequestUrl("Test", url, secure);

  it("allows https for a request that carries a key", () => {
    expect(check("https://api.example.com/v1/messages")).toBeUndefined();
    expect(check("https://api.example.com:8443/v1")).toBeUndefined();
  });

  it.each(["http://localhost:11434/x", "http://localhost", "http://127.0.0.1:8080/v1", "http://127.1.2.3/x", "http://[::1]:3000/x"])(
    "allows plain http to this machine, even with a key: %s",
    (url) => {
      expect(check(url)).toBeUndefined();
    },
  );

  it.each([
    "http://api.example.com/v1",
    "http://10.0.0.5/x",
    "http://192.168.1.2:8000",
    "http://gpu-box:11434",
    "http://localhost.evil.example/x",
    "http://127.0.0.1.evil.example/x",
    "http://app.localhost/x",
  ])("refuses plain http anywhere else when a key goes with it: %s", (url) => {
    const refused = check(url);
    expect(refused).toBeInstanceOf(ProviderRequestError);
    expect(refused?.message).toContain("over plain http");
    expect(refused?.message).toContain("https://");
    expect(refused?.message).toContain(new URL(url).hostname);
  });

  it("allows plain http anywhere when no key goes with the request", () => {
    expect(check("http://gpu-box:11434", false)).toBeUndefined();
    expect(check("http://192.168.1.2:8000/api", false)).toBeUndefined();
  });

  it.each(["ftp://example.com/x", "file:///etc/passwd", "javascript:alert(1)", "ws://example.com/x", "data:text/plain,hi"])(
    "refuses a scheme that is not http or https: %s",
    (url) => {
      expect(check(url, false)?.message).toContain("must start with http:// or https://");
    },
  );

  it.each(["not a url", "", "://nohost", "http://"])("refuses something that is not a URL: %j", (url) => {
    expect(check(url, false)?.message).toContain("not a valid URL");
  });

  it("refuses a username or password in the URL, with or without a key, and does not repeat them", () => {
    for (const secure of [true, false]) {
      const refused = check("https://alice:hunter2@api.example.com/v1", secure);
      expect(refused?.message).toContain("contains a username or password");
      expect(refused?.message).not.toContain("hunter2");
      expect(refused?.message).not.toContain("alice");
    }
    expect(check("https://alice@api.example.com/v1", false)?.message).toContain("username or password");
  });

  it("never repeats the path or the query, which can hold a credential", () => {
    const refused = check("http://evil.example/secret-path?token=abc123");
    expect(refused?.message).not.toContain("secret-path");
    expect(refused?.message).not.toContain("abc123");
    expect(refused?.message).toContain("evil.example");
  });
});

describe("requests that carry a key", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const base = { provider: "Test", baseUrl: "http://remote.example", url: "http://remote.example/x" };

  it("are refused before anything is sent when the URL is plain http to another machine, by all three kinds of request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const posted = await postJson({ ...base, body: {}, headers: { "x-api-key": "SECRET" }, secure: true });
    const got = await getJson({ ...base, headers: { "x-api-key": "SECRET" }, secure: true });
    const streamed = await postStream({ ...base, body: {}, headers: { "x-api-key": "SECRET" }, secure: true });

    for (const result of [posted, got, streamed]) {
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.message).toContain("over plain http");
      expect(!result.ok && result.error.message).not.toContain("SECRET");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("go to https and to localhost as asked", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    expect((await postJson({ ...base, url: "https://remote.example/x", body: {}, secure: true })).ok).toBe(true);
    expect((await getJson({ ...base, url: "http://localhost:8080/x", secure: true })).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("are told not to follow a redirect, which would carry the key header to another site; other requests are left as before", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await postJson({ ...base, url: "https://remote.example/x", body: {}, secure: true });
    await getJson({ ...base, url: "https://remote.example/x", secure: true });
    await postJson({ ...base, url: "http://remote.example/x", body: {} });
    await getJson({ ...base, url: "http://remote.example/x" });

    const redirects = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).redirect);
    expect(redirects).toEqual(["error", "error", undefined, undefined]);
  });

  it("say that a redirect was refused, rather than blaming the network", async () => {
    const redirected = Object.assign(new TypeError("fetch failed"), { cause: new Error("unexpected redirect") });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(redirected));

    const secure = await getJson({ ...base, url: "https://remote.example/x", baseUrl: "https://remote.example", secure: true });
    expect(!secure.ok && secure.error.message).toBe("Test at https://remote.example redirected the request; it is not followed, since the API key would go with it");

    const plain = await getJson({ ...base, url: "http://remote.example/x" });
    expect(!plain.ok && plain.error.message).toBe("Failed to reach Test at http://remote.example");
  });

  it("refuse a URL with credentials in it even when no key goes along, without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await postJson({ ...base, url: "http://alice:hunter2@remote.example/x", body: {} });
    expect(!result.ok && result.error.message).toContain("username or password");
    expect(!result.ok && result.error.message).not.toContain("hunter2");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
