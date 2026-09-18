import type { ChatRequest } from "../types.js";
import type { OllamaConfig } from "./config.js";
import { toOllamaMessage, type OllamaMessage } from "./mappers/message.js";
import { toOllamaTools, type OllamaToolSpec } from "./mappers/tools.js";

export interface OllamaRequestBody {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaToolSpec[];
  stream: false;
  options?: { temperature: number };
}

/** Shapes a non-streaming request for Ollama's /api/chat endpoint. */
export function buildRequestBody(config: OllamaConfig, request: ChatRequest): OllamaRequestBody {
  return {
    model: config.model,
    messages: request.messages.map(toOllamaMessage),
    tools: request.tools && request.tools.length > 0 ? toOllamaTools(request.tools) : undefined,
    stream: false,
    options: request.temperature !== undefined ? { temperature: request.temperature } : undefined,
  };
}
