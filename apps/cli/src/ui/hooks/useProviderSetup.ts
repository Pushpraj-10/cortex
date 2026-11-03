import { useRef, useState } from "react";
import { CortexError, err } from "@cortex/core";
import type { ProviderId } from "../../provider/config.js";
import type { ActiveProvider, ProviderManager } from "../../provider/manager.js";
import {
  PROVIDER_LABELS,
  asksForModel,
  currentField,
  describeStatus,
  initialModelIndex,
  modelChoices,
  promptHint,
  startSetup,
  submitField,
  windowOf,
  type ModelChoice,
  type SetupState,
} from "../../provider/setup.js";
import type { SlashCommand } from "../types.js";

/** How many models the picker draws at once; a longer list scrolls as the selection moves. */
const MODEL_MENU_SIZE = 8;

type Flow =
  | { stage: "idle" }
  | { stage: "select"; kind: "provider"; options: SlashCommand[]; selectedIndex: number }
  | { stage: "select"; kind: "model"; state: SetupState; choices: ModelChoice[]; selectedIndex: number }
  /** Asking the provider which models it has, after the key (or server URL) was given. */
  | { stage: "loading"; state: SetupState }
  | { stage: "field"; state: SetupState; error?: string };

export interface SetupPromptData {
  title: string;
  label: string;
  hint: string;
  /** Whether the answer must be masked on screen. */
  secret: boolean;
  /** Waiting for the provider rather than asking a question: nothing to answer, only to cancel. */
  busy: boolean;
  error?: string;
}

export interface ProviderSetup {
  /** "select" is either the provider picker or the model picker; "loading" is the wait between them. */
  stage: Flow["stage"];
  /** The picker's entries on screen (a window of the models, when there are many); empty unless `stage` is "select". */
  menu: SlashCommand[];
  /** Which of `menu` is selected. */
  selectedIndex: number;
  /** The question being asked, or the wait; null unless `stage` is "field" or "loading". */
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

/** What the picker shows for the current flow: the entries on screen, and which of them is selected. */
function pickerView(flow: Flow): { menu: SlashCommand[]; selectedIndex: number } {
  if (flow.stage !== "select") return { menu: [], selectedIndex: 0 };
  if (flow.kind === "provider") return { menu: flow.options, selectedIndex: flow.selectedIndex };
  const shown = windowOf(flow.choices, flow.selectedIndex, MODEL_MENU_SIZE);
  return { menu: shown.items.map((choice) => ({ name: choice.id, description: choice.description })), selectedIndex: shown.selected };
}

/**
 * The `/provider` flow: pick a provider, answer its questions one at a time, pick a model from the ones the provider
 * lists (or type its name when it cannot say), then save and switch to it. The steps themselves live in
 * provider/setup.ts; this wires them to the provider manager and reports results through `notify`. Every message it
 * produces names providers, models and paths only — never an answer.
 */
export function useProviderSetup(
  manager: ProviderManager,
  notify: (text: string) => void,
  onActiveChange: (active: ActiveProvider | null) => void,
): ProviderSetup {
  const [flow, setFlow] = useState<Flow>({ stage: "idle" });
  /** The model lookup in flight. Cancelling aborts it, and an answer that arrives after that is ignored. */
  const lookup = useRef<AbortController | null>(null);

  async function begin(provider?: ProviderId) {
    try {
      if (provider) {
        setFlow({ stage: "field", state: startSetup(provider, await manager.saved(provider)) });
        return;
      }
      const status = await manager.status();
      setFlow({
        stage: "select",
        kind: "provider",
        options: status.map((s) => ({ name: s.id, description: describeStatus(s) })),
        selectedIndex: Math.max(0, status.findIndex((s) => s.active)),
      });
    } catch (error) {
      notify(`Could not read the saved settings: ${messageOf(error)}`);
    }
  }

  /**
   * Asks the provider which models it has and opens the picker. Anything that stops that — an unreachable server, a key it
   * rejects, nothing usable on offer — says so and falls back to typing the model's name, so setup is never stuck.
   */
  async function lookUpModels(state: SetupState) {
    const label = PROVIDER_LABELS[state.provider];
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setFlow({ stage: "loading", state });

    let listed: Awaited<ReturnType<ProviderManager["listModels"]>>;
    try {
      listed = await manager.listModels(state.provider, state.values, controller.signal);
    } catch (error) {
      listed = err(new CortexError(messageOf(error), "CLI_LIST_MODELS_FAILED", error));
    }
    if (controller.signal.aborted) return; // cancelled while waiting; cancel() has already reset the flow
    lookup.current = null;

    if (!listed.ok) {
      notify(`Could not list the models ${label} offers: ${listed.error.message}. Type the model's name instead.`);
      setFlow({ stage: "field", state });
      return;
    }
    if (listed.value.length === 0) {
      notify(`${label} did not list any models that can be used. Type the model's name instead.`);
      setFlow({ stage: "field", state });
      return;
    }

    const current = state.existing.model;
    const choices = modelChoices(listed.value, current);
    const count = listed.value.length;
    notify(`Found ${count} model${count === 1 ? "" : "s"} for ${label}. Pick one with ↑/↓ and enter.`);
    setFlow({ stage: "select", kind: "model", state, choices, selectedIndex: initialModelIndex(choices, current) });
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

  const view = pickerView(flow);
  const promptState = flow.stage === "field" || flow.stage === "loading" ? flow.state : null;

  return {
    stage: flow.stage,
    menu: view.menu,
    selectedIndex: view.selectedIndex,
    prompt: promptState
      ? {
          title: PROVIDER_LABELS[promptState.provider],
          label: flow.stage === "loading" ? "looking up the models available…" : currentField(promptState).label,
          hint: flow.stage === "loading" ? "just a moment" : promptHint(promptState),
          secret: flow.stage === "field" && currentField(promptState).secret,
          busy: flow.stage === "loading",
          error: flow.stage === "field" ? flow.error : undefined,
        }
      : null,

    begin: (provider) => void begin(provider),

    move: (delta) =>
      setFlow((current) => {
        if (current.stage !== "select") return current;
        const count = current.kind === "provider" ? current.options.length : current.choices.length;
        return { ...current, selectedIndex: Math.min(count - 1, Math.max(0, current.selectedIndex + delta)) };
      }),

    choose: () => {
      if (flow.stage !== "select") return;
      if (flow.kind === "provider") {
        void begin(flow.options[flow.selectedIndex]!.name as ProviderId);
        return;
      }

      const choice = flow.choices[flow.selectedIndex]!;
      if (choice.custom) {
        setFlow({ stage: "field", state: flow.state });
        return;
      }
      const outcome = submitField(flow.state, choice.id);
      if (outcome.kind === "done") {
        setFlow({ stage: "idle" });
        void finish(outcome.provider, outcome.values);
      } else {
        setFlow({ stage: "field", state: outcome.kind === "next" ? outcome.state : flow.state });
      }
    },

    submit: (answer) => {
      if (flow.stage !== "field") return;
      const outcome = submitField(flow.state, answer);
      if (outcome.kind === "invalid") {
        setFlow({ ...flow, error: outcome.message });
      } else if (outcome.kind === "next") {
        if (asksForModel(outcome.state)) void lookUpModels(outcome.state);
        else setFlow({ stage: "field", state: outcome.state });
      } else {
        setFlow({ stage: "idle" });
        void finish(outcome.provider, outcome.values);
      }
    },

    cancel: () => {
      lookup.current?.abort();
      lookup.current = null;
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
