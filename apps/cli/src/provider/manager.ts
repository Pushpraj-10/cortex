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
import { getLlmProvider, type LLMProvider, type ModelInfo } from "@cortex/providers";
import {
  PROVIDER_ENV,
  PROVIDER_IDS,
  credentialsToEnv,
  layerEnv,
  resolveProvider,
  type ProviderChoice,
  type ProviderId,
} from "./config.js";

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
  /**
   * The models a provider offers to this key / server, for `/provider` to pick from. `values` are the answers given so far
   * (they win over what is saved or in the environment). Fails when the provider cannot be reached or rejects the key; an
   * empty list means it has nothing usable to offer. The error text never contains the key.
   */
  listModels(provider: ProviderId, values: StoredProvider, signal?: AbortSignal): Promise<Result<ModelInfo[]>>;
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

  const noProvider = () => failure("No model provider is configured. Type /provider to set one up.", "CLI_NO_PROVIDER");

  const llm: LLMProvider = {
    async chat(request) {
      if (!current) return noProvider();
      return current.chat(request);
    },

    /**
     * Streams from whichever provider is active when the request starts (a switch mid-reply does not move it). A provider that
     * cannot stream gets its whole reply passed on as one piece of text, so callers can treat every provider the same way.
     */
    async *chatStream(request) {
      const provider = current;
      if (!provider) {
        const missing = noProvider();
        yield { type: "error", error: missing.ok ? new CortexError("No model provider is configured.", "CLI_NO_PROVIDER") : missing.error };
        return;
      }
      if (provider.chatStream) {
        yield* provider.chatStream(request);
        return;
      }

      const reply = await provider.chat(request);
      if (!reply.ok) {
        yield { type: "error", error: reply.error };
        return;
      }
      if (reply.value.content !== "") yield { type: "text", delta: reply.value.content };
      yield { type: "done", message: reply.value };
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

    async listModels(provider, values, signal) {
      const descriptor = getLlmProvider(provider);
      if (!descriptor.listModels) return ok([]);

      const env = await effectiveEnv();
      const names = PROVIDER_ENV[provider];
      const apiKey = values.apiKey || (names.apiKey ? env[names.apiKey] : undefined) || undefined;
      const baseUrl = values.baseUrl || env[names.baseUrl] || undefined;
      if (names.apiKey && !apiKey) return failure("There is no API key to look up models with.", "CLI_NO_API_KEY");

      const listed = await descriptor.listModels({ ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}) }, signal);
      if (listed.ok || !apiKey) return listed;
      // Whatever the provider sent back, the key is not repeated: the message is shown to the user and kept in the transcript.
      return failure(listed.error.message.split(apiKey).join("…"), listed.error.code);
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
