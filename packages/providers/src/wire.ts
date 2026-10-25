/**
 * Plumbing shared by the HTTP providers: one error type and one JSON POST helper.
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

/** POSTs a JSON body and returns the parsed JSON reply, folding every failure mode into a Result. */
export async function postJson<T>(opts: PostJsonOptions): Promise<Result<T>> {
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
  return ok((await response.json()) as T);
}
