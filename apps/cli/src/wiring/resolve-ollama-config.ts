import { CortexError, ok, err, type Result } from "@cortex/shared";
import type { OllamaConfig } from "@cortex/llm";

export class MissingOllamaModelError extends CortexError {
  constructor() {
    super("OLLAMA_MODEL is not set. Add it to .env or export it before running cortex.", "CLI_MISSING_OLLAMA_MODEL");
  }
}

/** Reads OllamaConfig (model, baseUrl) from environment variables. */
export function resolveOllamaConfig(env: NodeJS.ProcessEnv = process.env): Result<OllamaConfig> {
  const model = env.OLLAMA_MODEL;
  if (!model) return err(new MissingOllamaModelError());

  return ok({ model, baseUrl: env.OLLAMA_BASE_URL });
}
