/**
 * Choosing and configuring the LLM provider from environment variables. The CLI is the one place
 * that decides which provider to use; @cortex/providers stays mechanism-only.
 *
 * Selection order: an explicit `CORTEX_PROVIDER` wins; otherwise Groq when `GROQ_API_KEY` is set
 * (cloud, fast iteration); otherwise Ollama (local, needs no key). Anthropic is opt-in only —
 * a stray `ANTHROPIC_API_KEY` left in the environment for other tools must never silently start
 * sending your code to a cloud provider.
 */
import { CortexError, ok, err, type Result } from "@cortex/core";
import type { AnthropicConfig, GroqConfig, OllamaConfig } from "@cortex/providers";

// ---- Ollama ----------------------------------------------------------------------

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

// ---- Groq ------------------------------------------------------------------------

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

// ---- Anthropic -------------------------------------------------------------------

export class MissingAnthropicApiKeyError extends CortexError {
  constructor() {
    super("ANTHROPIC_API_KEY is not set (required when CORTEX_PROVIDER=anthropic).", "CLI_MISSING_ANTHROPIC_API_KEY");
  }
}

export class MissingAnthropicModelError extends CortexError {
  constructor() {
    super("ANTHROPIC_MODEL is not set. Add it to .env or export it before running cortex.", "CLI_MISSING_ANTHROPIC_MODEL");
  }
}

/** Reads AnthropicConfig (apiKey, model, baseUrl) from environment variables. */
export function resolveAnthropicConfig(env: NodeJS.ProcessEnv = process.env): Result<AnthropicConfig> {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return err(new MissingAnthropicApiKeyError());

  const model = env.ANTHROPIC_MODEL;
  if (!model) return err(new MissingAnthropicModelError());

  return ok({ apiKey, model, baseUrl: env.ANTHROPIC_BASE_URL });
}

// ---- Selection -------------------------------------------------------------------

export const PROVIDER_IDS = ["ollama", "groq", "anthropic"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export class InvalidProviderError extends CortexError {
  constructor(value: string) {
    super(`Unknown CORTEX_PROVIDER "${value}". Use one of: ${PROVIDER_IDS.join(", ")}.`, "CLI_INVALID_PROVIDER");
  }
}

export interface ProviderChoice {
  /** The id the provider is registered under in @cortex/providers. */
  id: ProviderId;
  model: string;
  /** The config object to pass to that provider's `createClient`. */
  config: OllamaConfig | GroqConfig | AnthropicConfig;
}

/** Applies the selection order described at the top of this file and resolves the chosen provider's config. */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): Result<ProviderChoice> {
  const requested = env.CORTEX_PROVIDER;
  if (requested !== undefined && !(PROVIDER_IDS as readonly string[]).includes(requested)) {
    return err(new InvalidProviderError(requested));
  }

  const id: ProviderId = (requested as ProviderId | undefined) ?? (env.GROQ_API_KEY ? "groq" : "ollama");
  const resolve = { ollama: resolveOllamaConfig, groq: resolveGroqConfig, anthropic: resolveAnthropicConfig }[id];

  const config = resolve(env);
  if (!config.ok) return config;
  return ok({ id, model: config.value.model, config: config.value });
}
