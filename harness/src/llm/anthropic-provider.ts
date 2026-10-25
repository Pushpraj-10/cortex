import type { LlmProvider, LlmRequest, LlmResponse, ContentBlock } from "./types";

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Non-streaming Messages API client. */
export function createAnthropicProvider(opts: AnthropicOptions): LlmProvider {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;

  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: req.messages,
          ...(req.tools.length > 0 ? { tools: req.tools } : {}),
        }),
      });
      if (!res.ok) throw new Error(`LLM request failed (${res.status}): ${await res.text()}`);
      const data = (await res.json()) as { content: ContentBlock[]; stop_reason: string };
      return { content: data.content, stopReason: data.stop_reason };
    },
  };
}
