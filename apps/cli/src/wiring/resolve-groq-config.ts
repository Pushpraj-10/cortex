import { CortexError, ok, err, type Result } from "@cortex/shared";
import type { GroqConfig } from "@cortex/llm";

export class MissingGroqModelError extends CortexError {
  constructor() {
    super("GROQ_MODEL is not set. Add it to .env or export it before running cortex.", "CLI_MISSING_GROQ_MODEL");
  }
}

export class MissingGroqApiKeyError extends CortexError {
  constructor() {
    super("GROQ_API_KEY is not set.", "CLI_MISSING_GROQ_API_KEY");
  }
}

/** Reads GroqConfig (apiKey, model, baseUrl) from environment variables. */
export function resolveGroqConfig(env: NodeJS.ProcessEnv = process.env): Result<GroqConfig> {
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return err(new MissingGroqApiKeyError());

  const model = env.GROQ_MODEL;
  if (!model) return err(new MissingGroqModelError());

  return ok({ apiKey, model, baseUrl: env.GROQ_BASE_URL });
}
