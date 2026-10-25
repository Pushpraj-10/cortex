/**
 * The running app's view of its LLM provider: which one is active, what is saved, and how to change it
 * without restarting. Sessions and the `task` tool all talk to `llm`, which delegates to whichever
 * provider is active, so a switch takes effect on the very next request.
 *
 * Nothing returned from here ever contains an API key — results carry only names, models and paths — so
 * callers can show them freely.
 */
import {
  credentialsPath,
  loadCredentials,
  removeProviderCredentials,
  saveProviderCredentials,
  type StoredProvider,
} from "@cortex/config";
import { CortexError, err, ok, type Result } from "@cortex/core";
import { getLlmProvider, type LLMProvider } from "@cortex/providers";
import {
  PROVIDER_ENV,
  PROVIDER_IDS,
  credentialsToEnv,
  layerEnv,
  resolveProvider,
  type ProviderChoice,
  type ProviderId,
} from "./provider-config.js";

export interface ActiveProvider {
  provider: ProviderId;
  model: string;
}

export interface ProviderStatus {
  id: ProviderId;
  active: boolean;
  /** True when the provider's configuration resolves, from saved settings and/or the environment. */
  configured: boolean;
  model?: string;
  needsKey: boolean;
  hasKey: boolean;
}

export interface ConfigureResult extends ActiveProvider {
  savedTo: string;
  /** Environment variables that currently override part of what was just saved. */
  overriddenBy: string[];
}

export interface ProviderManager {
  /** Delegates to the active provider; fails with CLI_NO_PROVIDER until one is configured. */
  readonly llm: LLMProvider;
  active(): ActiveProvider | null;
  status(): Promise<ProviderStatus[]>;
  /** What is saved on disk for a provider (not the environment). */
  saved(provider: ProviderId): Promise<StoredProvider>;
  /** Saves the values, makes the provider the default, and switches the running app to it. */
  configure(provider: ProviderId, values: StoredProvider): Promise<Result<ConfigureResult>>;
  remove(provider: ProviderId): Promise<Result<{ removed: boolean }>>;
}

export interface ProviderManagerOptions {
  /** The real environment (not layered with saved settings); used to detect overrides. */
  env: NodeJS.ProcessEnv;
  home?: string;
  /** The provider to start with; omit when nothing is configured yet. */
  initial?: ProviderChoice;
}

const createClient = (choice: ProviderChoice): LLMProvider => getLlmProvider(choice.id).createClient(choice.config);

function failure(message: string, code: string, cause?: unknown): Result<never> {
  return err(new CortexError(message, code, cause));
}

export function createProviderManager(options: ProviderManagerOptions): ProviderManager {
  let current: LLMProvider | null = options.initial ? createClient(options.initial) : null;
  let active: ActiveProvider | null = options.initial ? { provider: options.initial.id, model: options.initial.model } : null;

  const llm: LLMProvider = {
    async chat(request) {
      if (!current) return failure("No model provider is configured. Type /provider to set one up.", "CLI_NO_PROVIDER");
      return current.chat(request);
    },
  };

  /** Saved settings underneath the real environment: what a fresh start would use. */
  const effectiveEnv = async () => layerEnv(credentialsToEnv(await loadCredentials(options.home)), options.env);

  return {
    llm,
    active: () => active,

    async status() {
      const env = await effectiveEnv();
      return PROVIDER_IDS.map((id) => {
        const names = PROVIDER_ENV[id];
        return {
          id,
          active: active?.provider === id,
          configured: resolveProvider(id, env).ok,
          model: env[names.model] || undefined,
          needsKey: names.apiKey !== undefined,
          hasKey: names.apiKey !== undefined && Boolean(env[names.apiKey]),
        };
      });
    },

    async saved(provider) {
      return (await loadCredentials(options.home)).providers[provider] ?? {};
    },

    async configure(provider, values) {
      try {
        await saveProviderCredentials(provider, values, { home: options.home, activate: true });
      } catch (error) {
        return failure(`Could not save the settings: ${error instanceof Error ? error.message : String(error)}`, "CLI_CREDENTIALS_FAILED", error);
      }

      const credentials = await loadCredentials(options.home);
      const choice = resolveProvider(provider, layerEnv(credentialsToEnv(credentials), options.env));
      if (!choice.ok) return choice;

      current = createClient(choice.value);
      active = { provider, model: choice.value.model };

      const names = PROVIDER_ENV[provider];
      const saved = credentials.providers[provider] ?? {};
      const overriddenBy: string[] = [];
      for (const [field, variable] of [["apiKey", names.apiKey], ["model", names.model], ["baseUrl", names.baseUrl]] as const) {
        const fromEnv = variable ? options.env[variable] : undefined;
        if (variable && fromEnv && saved[field] !== undefined && fromEnv !== saved[field]) overriddenBy.push(variable);
      }
      if (options.env.CORTEX_PROVIDER && options.env.CORTEX_PROVIDER !== provider) overriddenBy.push("CORTEX_PROVIDER");

      return ok({ ...active, savedTo: credentialsPath(options.home), overriddenBy });
    },

    async remove(provider) {
      try {
        return ok({ removed: await removeProviderCredentials(provider, options.home) });
      } catch (error) {
        return failure(`Could not update the saved settings: ${error instanceof Error ? error.message : String(error)}`, "CLI_CREDENTIALS_FAILED", error);
      }
    },
  };
}
