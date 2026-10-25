import { useState } from "react";
import type { ProviderId } from "../provider-config.js";
import type { ActiveProvider, ProviderManager } from "../provider-manager.js";
import { PROVIDER_LABELS, currentField, describeStatus, promptHint, startSetup, submitField, type SetupState } from "../provider-setup.js";
import type { SlashCommand } from "../types.js";

type Flow =
  | { stage: "idle" }
  | { stage: "select"; options: SlashCommand[]; selectedIndex: number }
  | { stage: "field"; state: SetupState; error?: string };

export interface SetupPromptData {
  title: string;
  label: string;
  hint: string;
  /** Whether the answer must be masked on screen. */
  secret: boolean;
  error?: string;
}

export interface ProviderSetup {
  stage: Flow["stage"];
  /** The picker's entries; empty unless `stage` is "select". */
  menu: SlashCommand[];
  selectedIndex: number;
  /** The question being asked; null unless `stage` is "field". */
  prompt: SetupPromptData | null;
  /** Opens the picker, or goes straight to one provider's questions. */
  begin(provider?: ProviderId): void;
  move(delta: number): void;
  choose(): void;
  /** Answers the current question. The answer is passed through and never stored here once the next step starts. */
  submit(answer: string): void;
  cancel(): void;
  remove(provider: ProviderId): void;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The `/provider` flow: pick a provider, answer its questions one at a time, then save and switch to it.
 * The steps themselves live in provider-setup.ts; this wires them to the provider manager and reports
 * results through `notify`. Every message it produces names providers, models and paths only — never an answer.
 */
export function useProviderSetup(
  manager: ProviderManager,
  notify: (text: string) => void,
  onActiveChange: (active: ActiveProvider | null) => void,
): ProviderSetup {
  const [flow, setFlow] = useState<Flow>({ stage: "idle" });

  async function begin(provider?: ProviderId) {
    try {
      if (provider) {
        setFlow({ stage: "field", state: startSetup(provider, await manager.saved(provider)) });
        return;
      }
      const status = await manager.status();
      setFlow({
        stage: "select",
        options: status.map((s) => ({ name: s.id, description: describeStatus(s) })),
        selectedIndex: Math.max(0, status.findIndex((s) => s.active)),
      });
    } catch (error) {
      notify(`Could not read the saved settings: ${messageOf(error)}`);
    }
  }

  async function finish(provider: ProviderId, values: Parameters<ProviderManager["configure"]>[1]) {
    const label = PROVIDER_LABELS[provider];
    const result = await manager.configure(provider, values);
    if (!result.ok) {
      notify(`Could not set up ${label}: ${result.error.message}`);
      return;
    }
    onActiveChange(manager.active());
    notify(`Now using ${label} (${result.value.model}). Settings saved to ${result.value.savedTo}.`);
    if (result.value.overriddenBy.length > 0) {
      notify(`Note: ${result.value.overriddenBy.join(", ")} in your environment takes precedence over what you just saved.`);
    }
  }

  return {
    stage: flow.stage,
    menu: flow.stage === "select" ? flow.options : [],
    selectedIndex: flow.stage === "select" ? flow.selectedIndex : 0,
    prompt:
      flow.stage === "field"
        ? {
            title: PROVIDER_LABELS[flow.state.provider],
            label: currentField(flow.state).label,
            hint: promptHint(flow.state),
            secret: currentField(flow.state).secret,
            error: flow.error,
          }
        : null,

    begin: (provider) => void begin(provider),

    move: (delta) =>
      setFlow((current) =>
        current.stage === "select"
          ? { ...current, selectedIndex: Math.min(current.options.length - 1, Math.max(0, current.selectedIndex + delta)) }
          : current,
      ),

    choose: () => {
      if (flow.stage === "select") void begin(flow.options[flow.selectedIndex]!.name as ProviderId);
    },

    submit: (answer) => {
      if (flow.stage !== "field") return;
      const outcome = submitField(flow.state, answer);
      if (outcome.kind === "invalid") {
        setFlow({ ...flow, error: outcome.message });
      } else if (outcome.kind === "next") {
        setFlow({ stage: "field", state: outcome.state });
      } else {
        setFlow({ stage: "idle" });
        void finish(outcome.provider, outcome.values);
      }
    },

    cancel: () => {
      setFlow({ stage: "idle" });
      notify("Setup cancelled; nothing was changed.");
    },

    remove: (provider) => {
      void (async () => {
        const label = PROVIDER_LABELS[provider];
        const result = await manager.remove(provider);
        if (!result.ok) notify(result.error.message);
        else if (!result.value.removed) notify(`Nothing was saved for ${label}.`);
        else if (manager.active()?.provider === provider) {
          notify(`Removed the saved settings for ${label}. This session keeps using it until you switch or restart.`);
        } else notify(`Removed the saved settings for ${label}.`);
      })();
    },
  };
}
