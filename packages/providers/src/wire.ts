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

export interface PostJsonOptions {
  /** Display name used in error messages, e.g. "Ollama". */
  provider: string;
  baseUrl: string;
  url: string;
  headers?: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
}

/** POSTs a JSON body and returns the response once the status is known to be 2xx; every failure mode is a Result. */
async function post(opts: PostJsonOptions): Promise<Result<Response>> {
  let response: Response;
  try {
    response = await fetch(opts.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...opts.headers },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (error) {
    return err(new ProviderRequestError(opts.provider, `Failed to reach ${opts.provider} at ${opts.baseUrl}`, error));
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
