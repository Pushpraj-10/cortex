import { CortexError } from "@cortex/shared";

export class GroqRequestError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "LLM_GROQ_REQUEST_FAILED", cause);
  }
}
