import { err, ok, type Result } from "@cortex/shared";
import type { ChatMessage, ChatRequest } from "../types.js";
import type { LLMProvider } from "../core/llm-provider.js";
import type { OllamaConfig } from "./config.js";
import { buildRequestBody } from "./request-builder.js";
import { OllamaRequestError } from "./errors.js";
import { fromOllamaToolCalls } from "./mappers/tool-calls.js";

interface OllamaChatResponse {
  message?: {
    content: string;
    tool_calls?: { function: { name: string; arguments: unknown } }[];
  };
}

const DEFAULT_BASE_URL = "http://localhost:11434";

/** Ollama client implementing the LLMProvider interface. */
class OllamaClient implements LLMProvider {
  private baseUrl: string;

  constructor(private config: OllamaConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  async chat(request: ChatRequest): Promise<Result<ChatMessage>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildRequestBody(this.config, request)),
        signal: request.signal,
      });
    } catch (error) {
      return err(new OllamaRequestError(`Failed to reach Ollama at ${this.baseUrl}`, error));
    }

    if (!response.ok) {
      return err(new OllamaRequestError(`Ollama returned ${response.status}: ${await response.text()}`));
    }

    const data = (await response.json()) as OllamaChatResponse;
    if (!data.message) {
      return err(new OllamaRequestError("Ollama response had no message"));
    }

    const toolCalls = fromOllamaToolCalls(data.message.tool_calls);
    return ok({ role: "assistant", content: data.message.content, ...(toolCalls ? { toolCalls } : {}) });
  }
}

/** Factory function to create an Ollama client. */
export function createOllamaClient(config: OllamaConfig): LLMProvider {
  return new OllamaClient(config);
}
