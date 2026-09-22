import { err, ok, type Result } from "@cortex/shared";
import type { ChatMessage, ChatRequest } from "../types.js";
import type { LLMProvider } from "../core/llm-provider.js";
import type { GroqConfig } from "./config.js";
import { buildRequestBody } from "./request-builder.js";
import { GroqRequestError } from "./errors.js";
import { fromGroqToolCalls } from "./mappers/tool-calls.js";

interface GroqChatResponse {
  choices?: {
    message?: {
      content: string | null;
      tool_calls?: { function: { name: string; arguments: string } }[];
    };
  }[];
}

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

/** Groq client implementing the LLMProvider interface, via its OpenAI-compatible chat-completions API. */
class GroqClient implements LLMProvider {
  private baseUrl: string;

  constructor(private config: GroqConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async chat(request: ChatRequest): Promise<Result<ChatMessage>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(this.config, request)),
        signal: request.signal,
      });
    } catch (error) {
      return err(new GroqRequestError(`Failed to reach Groq at ${this.baseUrl}`, error));
    }

    if (!response.ok) {
      return err(new GroqRequestError(`Groq returned ${response.status}: ${await response.text()}`));
    }

    const data = (await response.json()) as GroqChatResponse;
    const message = data.choices?.[0]?.message;
    if (!message) {
      return err(new GroqRequestError("Groq response had no message"));
    }

    const toolCalls = fromGroqToolCalls(message.tool_calls);
    return ok({ role: "assistant", content: message.content ?? "", ...(toolCalls ? { toolCalls } : {}) });
  }
}

/** Factory function to create a Groq client. */
export function createGroqClient(config: GroqConfig): LLMProvider {
  return new GroqClient(config);
}
