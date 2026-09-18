import { CortexError } from "@cortex/shared";

export class OllamaRequestError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "LLM_OLLAMA_REQUEST_FAILED", cause);
  }
}
