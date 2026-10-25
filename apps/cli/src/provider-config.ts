/**
 * Choosing and configuring the LLM provider from environment variables. The CLI is the one place
 * that decides which provider to use; @cortex/providers stays mechanism-only.
 *
 * Selection: an explicit `CORTEX_PROVIDER` wins; otherwise Ollama (local, needs no key). The cloud
 * providers (Google, Anthropic) are opt-in only — an API key left in the environment for other tools
 * must never silently start sending your code to a cloud provider.
 */
import type { Credentials } from "@cortex/config";
import { CortexError, ok, err, type Result } from "@cortex/core";
import type { AnthropicConfig, GoogleConfig, OllamaConfig } from "@cortex/providers";

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

// ---- Google ----------------------------------------------------------------------

export class MissingGoogleApiKeyError extends CortexError {
  constructor() {
    super("GOOGLE_API_KEY is not set (required when CORTEX_PROVIDER=google).", "CLI_MISSING_GOOGLE_API_KEY");
  }
}

export class MissingGoogleModelError extends CortexError {
  constructor() {
    super("GOOGLE_MODEL is not set. Add it to .env or export it before running cortex.", "CLI_MISSING_GOOGLE_MODEL");
  }
}

/** Reads GoogleConfig (apiKey, model, baseUrl) from environment variables. */
export function resolveGoogleConfig(env: NodeJS.ProcessEnv = process.env): Result<GoogleConfig> {
  const apiKey = env.GOOGLE_API_KEY;
  if (!apiKey) return err(new MissingGoogleApiKeyError());

  const model = env.GOOGLE_MODEL;
  if (!model) return err(new MissingGoogleModelError());

  return ok({ apiKey, model, baseUrl: env.GOOGLE_BASE_URL });
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

export const PROVIDER_IDS = ["ollama", "google", "anthropic"] as const;
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
  config: OllamaConfig | GoogleConfig | AnthropicConfig;
}

export function isProviderId(value: unknown): value is ProviderId {
  return (PROVIDER_IDS as readonly unknown[]).includes(value);
}

/** Resolves one specific provider's config from `env`, whether or not it is the selected one. */
export function resolveProvider(id: ProviderId, env: NodeJS.ProcessEnv = process.env): Result<ProviderChoice> {
  const resolve = { ollama: resolveOllamaConfig, google: resolveGoogleConfig, anthropic: resolveAnthropicConfig }[id];
  const config = resolve(env);
  if (!config.ok) return config;
  return ok({ id, model: config.value.model, config: config.value });
}

/** Applies the selection described at the top of this file and resolves the chosen provider's config. */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): Result<ProviderChoice> {
  const requested = env.CORTEX_PROVIDER || undefined; // an empty value (as in a copied .env.example) means "not set"
  if (requested !== undefined && !isProviderId(requested)) return err(new InvalidProviderError(requested));
  return resolveProvider(requested ?? "ollama", env);
}

// ---- Saved settings --------------------------------------------------------------

/**
 * The environment variables each provider reads. Saved settings are expressed through these same names,
 * so there is a single path from configuration to a provider's config.
 */
export const PROVIDER_ENV: Record<ProviderId, { apiKey?: string; model: string; baseUrl: string }> = {
  ollama: { model: "OLLAMA_MODEL", baseUrl: "OLLAMA_BASE_URL" },
  google: { apiKey: "GOOGLE_API_KEY", model: "GOOGLE_MODEL", baseUrl: "GOOGLE_BASE_URL" },
  anthropic: { apiKey: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL", baseUrl: "ANTHROPIC_BASE_URL" },
};

/** Saved provider settings (and the saved default provider) as the environment variables the resolvers read. */
export function credentialsToEnv(credentials: Credentials): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const id of PROVIDER_IDS) {
    const saved = credentials.providers[id];
    if (!saved) continue;
    const names = PROVIDER_ENV[id];
    if (saved.apiKey && names.apiKey) env[names.apiKey] = saved.apiKey;
    if (saved.model) env[names.model] = saved.model;
    if (saved.baseUrl) env[names.baseUrl] = saved.baseUrl;
  }
  if (isProviderId(credentials.activeProvider)) env.CORTEX_PROVIDER = credentials.activeProvider;
  return env;
}

/**
 * Saved settings underneath the real environment: a variable that is set and non-empty wins, as with
 * `.env`; an empty one (like a blank line copied from `.env.example`) counts as unset, so it cannot
 * hide a saved key.
 */
export function layerEnv(saved: NodeJS.ProcessEnv, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...saved, ...Object.fromEntries(Object.entries(env).filter(([, value]) => value)) };
}
