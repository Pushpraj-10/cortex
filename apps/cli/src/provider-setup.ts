/**
 * The guided `/provider` flow, as pure logic: which questions each provider asks, and a small state
 * machine that walks through them one answer at a time. The React hook drives it; nothing here touches
 * the screen, the disk or the network, so it can be tested exhaustively.
 */
import type { StoredProvider } from "@cortex/config";
import type { ProviderId } from "./provider-config.js";
import type { ProviderStatus } from "./provider-manager.js";

export interface FieldSpec {
  key: keyof StoredProvider;
  label: string;
  /** Shown masked while typing and never echoed back. */
  secret: boolean;
  required: boolean;
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  ollama: "Ollama (local)",
  google: "Google Gemini",
  anthropic: "Anthropic Claude",
};

/** Only what a typical user needs; other overrides (e.g. a custom API URL for the cloud providers) stay in the environment. */
export const PROVIDER_FIELDS: Record<ProviderId, FieldSpec[]> = {
  ollama: [
    { key: "model", label: "Model (for example llama3.1)", secret: false, required: true },
    { key: "baseUrl", label: "Server URL (leave blank for http://localhost:11434)", secret: false, required: false },
  ],
  google: [
    { key: "apiKey", label: "Google API key", secret: true, required: true },
    { key: "model", label: "Model (for example gemini-2.0-flash)", secret: false, required: true },
  ],
  anthropic: [
    { key: "apiKey", label: "Anthropic API key", secret: true, required: true },
    { key: "model", label: "Model", secret: false, required: true },
  ],
};

export interface SetupState {
  provider: ProviderId;
  /** Which field is being asked. */
  index: number;
  /** Answers so far. */
  values: StoredProvider;
  /** What is already saved, so an empty answer can keep it. */
  existing: StoredProvider;
}

export function startSetup(provider: ProviderId, existing: StoredProvider = {}): SetupState {
  return { provider, index: 0, values: {}, existing };
}

export function currentField(state: SetupState): FieldSpec {
  return PROVIDER_FIELDS[state.provider][state.index]!;
}

/** What an empty answer does for the current field, for the prompt's second line. Never includes a secret. */
export function promptHint(state: SetupState): string {
  const field = currentField(state);
  const saved = state.existing[field.key];
  if (saved) return field.secret ? "enter keeps the saved key" : `enter keeps "${saved}"`;
  return field.required ? "required" : "optional — enter to skip";
}

export type SubmitOutcome =
  | { kind: "next"; state: SetupState }
  | { kind: "done"; provider: ProviderId; values: StoredProvider }
  | { kind: "invalid"; message: string };

/**
 * Applies one answer. An empty answer keeps the saved value if there is one, skips an optional field,
 * and is rejected for a required one. After the last field the collected values are returned.
 */
export function submitField(state: SetupState, input: string): SubmitOutcome {
  const field = currentField(state);
  const answer = input.trim() || state.existing[field.key];

  if (!answer && field.required) return { kind: "invalid", message: `${field.label} is required.` };

  const values: StoredProvider = answer ? { ...state.values, [field.key]: answer } : state.values;
  if (state.index + 1 >= PROVIDER_FIELDS[state.provider].length) return { kind: "done", provider: state.provider, values };
  return { kind: "next", state: { ...state, index: state.index + 1, values } };
}

/** Hides what was typed while keeping its length, so the user can see that input arrived. */
export function maskValue(value: string): string {
  return "•".repeat(value.length);
}

/** One line for the provider picker: the provider, and whether it is set up. */
export function describeStatus(status: ProviderStatus): string {
  const details = status.configured
    ? [status.model, status.needsKey ? "key set" : undefined].filter(Boolean).join(", ")
    : "not set up";
  return `${PROVIDER_LABELS[status.id]} · ${details}${status.active ? " (active)" : ""}`;
}
