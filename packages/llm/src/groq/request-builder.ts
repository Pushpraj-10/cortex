import type { ChatRequest } from "../types.js";
import type { GroqConfig } from "./config.js";
import { toGroqMessage, type GroqMessage } from "./mappers/message.js";
import { toGroqTools, type GroqToolSpec } from "./mappers/tools.js";

export interface GroqRequestBody {
  model: string;
  messages: GroqMessage[];
  tools?: GroqToolSpec[];
  temperature?: number;
}

/** Shapes a non-streaming request for Groq's /chat/completions endpoint. */
export function buildRequestBody(config: GroqConfig, request: ChatRequest): GroqRequestBody {
  return {
    model: config.model,
    messages: request.messages.map(toGroqMessage),
    tools: request.tools && request.tools.length > 0 ? toGroqTools(request.tools) : undefined,
    temperature: request.temperature,
  };
}
