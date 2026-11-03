/**
 * Plumbing shared by the HTTP providers: one error type, a JSON POST helper, and what is needed to read a
 * streamed reply (a POST that hands back the body, and readers that turn it into lines and SSE events).
 */
import { CortexError, err, ok, type Result } from "@cortex/core";

/** Any failure talking to a provider: network error, non-2xx status, or a malformed reply. */
export class ProviderRequestError extends CortexError {
  /** `provider` is the display name ("Ollama"); it also derives the code, e.g. LLM_OLLAMA_REQUEST_FAILED. */
  constructor(
    readonly provider: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, `LLM_${provider.toUpperCase()}_REQUEST_FAILED`, cause);
  }
}

// ---- Where a request may go ------------------------------------------------------

/**
 * Hosts a key may travel to over plain http, because the traffic never leaves this machine: the literal `localhost`, a
 * 127.x.x.x address, or `[::1]`. A name that merely ends in `.localhost` is not trusted, since what it means is up to DNS.
 */
const isLoopbackHost = (host: string): boolean => host === "localhost" || /^127(?:\.\d{1,3}){3}$/.test(host) || host === "[::1]";

/**
 * Whether a request may be sent to `url`, or why not. A request that carries a credential (`secure`) must go over https, or
 * plain http to this machine only: the key would otherwise cross the network readable. Any request is refused if the URL
 * is not http(s) or has a username or password in it. The messages name the host at most, never the rest of the URL, so a
 * credential written into one cannot reach a log or the transcript through them.
 */
export function checkRequestUrl(provider: string, url: string, secure: boolean): ProviderRequestError | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new ProviderRequestError(provider, `The ${provider} server URL is not a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new ProviderRequestError(provider, `The ${provider} server URL must start with http:// or https://`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return new ProviderRequestError(provider, `The ${provider} server URL contains a username or password. Remove it; a key goes in the API key setting`);
  }
  if (secure && parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    return new ProviderRequestError(
      provider,
      `${provider} would send its API key to ${parsed.hostname} over plain http. Use an https:// URL (plain http is only allowed for localhost)`,
    );
  }
  return undefined;
}

/** What fetch's failure means when it was told to refuse redirects: said plainly, since "fetch failed" would blame the network. */
function describeFetchFailure(opts: { provider: string; baseUrl: string; secure?: boolean }, error: unknown): ProviderRequestError {
  const reason = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ""}` : String(error);
  if (opts.secure && /redirect/i.test(reason)) {
    return new ProviderRequestError(opts.provider, `${opts.provider} at ${opts.baseUrl} redirected the request; it is not followed, since the API key would go with it`, error);
  }
  return new ProviderRequestError(opts.provider, `Failed to reach ${opts.provider} at ${opts.baseUrl}`, error);
}

export interface PostJsonOptions {
  /** Display name used in error messages, e.g. "Ollama". */
  provider: string;
  baseUrl: string;
  url: string;
  headers?: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
  /** The request carries an API key: it must go over https (or to localhost), and a redirect is refused rather than followed. */
  secure?: boolean;
}

/** POSTs a JSON body and returns the response once the status is known to be 2xx; every failure mode is a Result. */
async function post(opts: PostJsonOptions): Promise<Result<Response>> {
  const refused = checkRequestUrl(opts.provider, opts.url, opts.secure === true);
  if (refused) return err(refused);

  let response: Response;
  try {
    response = await fetch(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
      // fetch only drops the standard Authorization header when it follows a redirect to another site; an x-api-key would go along.
      ...(opts.secure ? { redirect: "error" as const } : {}),
    });
  } catch (error) {
    return err(describeFetchFailure(opts, error));
  }

  if (!response.ok) {
    return err(new ProviderRequestError(opts.provider, `${opts.provider} returned ${response.status}: ${await response.text()}`));
  }
  return ok(response);
}

/** POSTs a JSON body and returns the parsed JSON reply, folding every failure mode into a Result. */
export async function postJson<T>(opts: PostJsonOptions): Promise<Result<T>> {
  const response = await post(opts);
  if (!response.ok) return response;
  return ok((await response.value.json()) as T);
}

export interface GetJsonOptions {
  /** Display name used in error messages, e.g. "Ollama". */
  provider: string;
  baseUrl: string;
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Gives up after this long, so a server that never answers cannot hold a menu open. Defaults to 10 seconds. */
  timeoutMs?: number;
  /** The request carries an API key: it must go over https (or to localhost), and a redirect is refused rather than followed. */
  secure?: boolean;
}

const DEFAULT_GET_TIMEOUT_MS = 10_000;

/**
 * GETs JSON (used to list a provider's models) and folds every failure mode into a Result. The URL and headers never
 * appear in an error, so an API key sent in a header cannot leak through one; a non-2xx reply is reported with its status and body.
 */
export async function getJson<T>(opts: GetJsonOptions): Promise<Result<T>> {
  const refused = checkRequestUrl(opts.provider, opts.url, opts.secure === true);
  if (refused) return err(refused);

  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_GET_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(opts.url, { method: "GET", headers: opts.headers, signal, ...(opts.secure ? { redirect: "error" as const } : {}) });
  } catch (error) {
    if (timeout.aborted && !opts.signal?.aborted) {
      return err(new ProviderRequestError(opts.provider, `${opts.provider} at ${opts.baseUrl} did not answer in time`, error));
    }
    return err(describeFetchFailure(opts, error));
  }

  if (!response.ok) {
    return err(new ProviderRequestError(opts.provider, `${opts.provider} returned ${response.status}: ${await response.text()}`));
  }
  try {
    return ok((await response.json()) as T);
  } catch (error) {
    return err(new ProviderRequestError(opts.provider, `${opts.provider} sent a reply that is not valid JSON`, error));
  }
}

/** POSTs a JSON body and returns the reply's body to be read as it arrives, with the same failures as `postJson`. */
export async function postStream(opts: PostJsonOptions): Promise<Result<ReadableStream<Uint8Array>>> {
  const response = await post(opts);
  if (!response.ok) return response;
  if (!response.value.body) return err(new ProviderRequestError(opts.provider, `${opts.provider} sent no response body`));
  return ok(response.value.body);
}

/** The error for a stream that broke part-way (a dropped connection) or was cancelled by the caller's AbortSignal. */
export function streamInterrupted(provider: string, error: unknown): ProviderRequestError {
  if (error instanceof Error && error.name === "AbortError") return new ProviderRequestError(provider, `${provider} request was cancelled`, error);
  const reason = error instanceof Error ? error.message : String(error);
  return new ProviderRequestError(provider, `${provider} stream was interrupted: ${reason}`, error);
}

/**
 * The lines of a streamed body, however the network happened to split it into chunks: a line cut in two
 * arrives whole, `\r\n` counts as one line break, and a last line with no break is still delivered. The
 * connection is closed when the caller stops reading.
 */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      for (let newline = pending.indexOf("\n"); newline !== -1; newline = pending.indexOf("\n")) {
        yield pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.decode();
    if (pending !== "") yield pending.replace(/\r$/, "");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * The `data:` payload of each server-sent event in a streamed body. An event ends at a blank line; its data lines
 * are joined with newlines; comments and the other SSE fields (`event:`, `id:`) are ignored, since the providers
 * put everything they need in the data itself.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  let data: string[] = [];
  for await (const line of readLines(body)) {
    if (line === "") {
      if (data.length > 0) yield data.join("\n");
      data = [];
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (data.length > 0) yield data.join("\n");
}
