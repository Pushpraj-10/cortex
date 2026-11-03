import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "../../src/provider/config.js";
import {
  CUSTOM_MODEL_NAME,
  PROVIDER_FIELDS,
  asksForModel,
  currentField,
  describeStatus,
  initialModelIndex,
  maskValue,
  modelChoices,
  promptHint,
  startSetup,
  submitField,
  windowOf,
} from "../../src/provider/setup.js";

describe("PROVIDER_FIELDS", () => {
  it("asks something for every provider, and only ever treats the API key as secret", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_FIELDS[id].length).toBeGreaterThan(0);
      for (const field of PROVIDER_FIELDS[id]) expect(field.secret).toBe(field.key === "apiKey");
    }
  });

  it("asks for the model last, so that everything needed to list the models has been answered by then", () => {
    for (const id of PROVIDER_IDS) {
      const fields = PROVIDER_FIELDS[id];
      expect(fields[fields.length - 1]!.key).toBe("model");
      expect(fields.filter((field) => field.key === "model")).toHaveLength(1);
    }
  });

  it("asks for a key only from the providers that need one", () => {
    expect(PROVIDER_FIELDS.google[0]!.key).toBe("apiKey");
    expect(PROVIDER_FIELDS.anthropic[0]!.key).toBe("apiKey");
    expect(PROVIDER_FIELDS.ollama.some((f) => f.key === "apiKey")).toBe(false);
  });
});

describe("submitField", () => {
  it("walks a cloud provider through its key and model, then returns the values", () => {
    let state = startSetup("google");
    expect(currentField(state).key).toBe("apiKey");

    const first = submitField(state, "my-key");
    expect(first.kind).toBe("next");
    state = (first as { state: typeof state }).state;
    expect(currentField(state).key).toBe("model");

    expect(submitField(state, "gemini-2.0-flash")).toEqual({
      kind: "done",
      provider: "google",
      values: { apiKey: "my-key", model: "gemini-2.0-flash" },
    });
  });

  it("trims what was typed", () => {
    const outcome = submitField(startSetup("google"), "  my-key  ");
    expect(outcome.kind === "next" && outcome.state.values).toEqual({ apiKey: "my-key" });
  });

  it("rejects an empty answer to a required field, staying on it", () => {
    const outcome = submitField(startSetup("google"), "   ");
    expect(outcome).toEqual({ kind: "invalid", message: "Google API key is required." });
  });

  it("lets an empty answer keep what was already saved", () => {
    const state = startSetup("google", { apiKey: "saved-key", model: "saved-model" });
    const first = submitField(state, "");
    expect(first.kind === "next" && first.state.values).toEqual({ apiKey: "saved-key" });

    const done = submitField((first as { state: typeof state }).state, "");
    expect(done).toEqual({ kind: "done", provider: "google", values: { apiKey: "saved-key", model: "saved-model" } });
  });

  it("lets a new answer replace a saved one", () => {
    const first = submitField(startSetup("google", { apiKey: "old", model: "m" }), "new-key");
    expect(first.kind === "next" && first.state.values.apiKey).toBe("new-key");
  });

  it("skips an optional field left empty", () => {
    const afterUrl = submitField(startSetup("ollama"), "");
    expect(afterUrl.kind).toBe("next");

    const done = submitField((afterUrl as { state: ReturnType<typeof startSetup> }).state, "llama3.1");
    expect(done).toEqual({ kind: "done", provider: "ollama", values: { model: "llama3.1" } });
  });

  it("collects an optional field when it is given", () => {
    const afterUrl = submitField(startSetup("ollama"), "http://gpu-box:11434") as { state: ReturnType<typeof startSetup> };
    expect(submitField(afterUrl.state, "llama3.1")).toEqual({
      kind: "done",
      provider: "ollama",
      values: { baseUrl: "http://gpu-box:11434", model: "llama3.1" },
    });
  });
});

describe("promptHint", () => {
  it("says what an empty answer does, and never reveals a saved key", () => {
    expect(promptHint(startSetup("google"))).toBe("required");
    expect(promptHint(startSetup("google", { apiKey: "SECRET-VALUE" }))).toBe("enter keeps the saved key");
    expect(promptHint(startSetup("google", { apiKey: "SECRET-VALUE" }))).not.toContain("SECRET-VALUE");
  });

  it("shows a saved non-secret value and marks optional fields", () => {
    expect(promptHint(startSetup("ollama", { baseUrl: "http://box:1" }))).toBe('enter keeps "http://box:1"');

    const afterUrl = submitField(startSetup("ollama", { model: "m" }), "") as { state: ReturnType<typeof startSetup> };
    expect(promptHint(afterUrl.state)).toBe('enter keeps "m"');

    expect(promptHint(startSetup("ollama"))).toBe("optional — enter to skip");
  });
});

describe("maskValue", () => {
  it("replaces every character, keeping only the length", () => {
    expect(maskValue("abc123")).toBe("••••••");
    expect(maskValue("")).toBe("");
    expect(maskValue("AIza-secret")).not.toContain("AIza");
  });
});

describe("describeStatus", () => {
  const base = { id: "google" as const, active: false, configured: true, model: "gemini-test", needsKey: true, hasKey: true };

  it("describes a set-up provider with its model and key", () => {
    expect(describeStatus(base)).toBe("Google Gemini · gemini-test, key set");
  });

  it("marks the active provider", () => {
    expect(describeStatus({ ...base, active: true })).toBe("Google Gemini · gemini-test, key set (active)");
  });

  it("says when a provider is not set up", () => {
    expect(describeStatus({ ...base, configured: false, model: undefined, hasKey: false })).toBe("Google Gemini · not set up");
  });

  it("does not mention a key for a provider that needs none", () => {
    expect(describeStatus({ id: "ollama", active: false, configured: true, model: "llama3.1", needsKey: false, hasKey: false })).toBe(
      "Ollama (local) · llama3.1",
    );
  });
});

describe("asksForModel", () => {
  it("is true exactly when the next question is the model", () => {
    const afterKey = submitField(startSetup("google"), "key") as { state: ReturnType<typeof startSetup> };
    expect(asksForModel(startSetup("google"))).toBe(false);
    expect(asksForModel(afterKey.state)).toBe(true);

    const afterUrl = submitField(startSetup("ollama"), "") as { state: ReturnType<typeof startSetup> };
    expect(asksForModel(startSetup("ollama"))).toBe(false);
    expect(asksForModel(afterUrl.state)).toBe(true);
  });

  it("is what the answer that completes the lookup's inputs turns on, for every provider", () => {
    for (const id of PROVIDER_IDS) {
      let state = startSetup(id);
      let asked = false;
      for (let step = 0; step < PROVIDER_FIELDS[id].length && !asked; step++) {
        const outcome = submitField(state, currentField(state).secret ? "key" : "");
        if (outcome.kind === "next") {
          asked = asksForModel(outcome.state);
          state = outcome.state;
        }
      }
      expect(asked).toBe(true);
    }
  });
});

describe("modelChoices", () => {
  const models = [{ id: "claude-a", displayName: "Claude A" }, { id: "plain" }, { id: "same", displayName: "same" }];

  it("lists each model with its display name, then a way to type one that is not listed", () => {
    const choices = modelChoices(models);
    expect(choices.map((choice) => choice.id)).toEqual(["claude-a", "plain", "same", CUSTOM_MODEL_NAME]);
    expect(choices[0]!.description).toBe("Claude A");
    expect(choices[1]!.description).toBe("");
    expect(choices[2]!.description).toBe(""); // a display name that only repeats the id adds nothing
    expect(choices.map((choice) => Boolean(choice.custom))).toEqual([false, false, false, true]);
  });

  it("marks the model already in use", () => {
    const choices = modelChoices(models, "claude-a");
    expect(choices[0]!.description).toBe("Claude A · current");
    expect(modelChoices(models, "plain")[1]!.description).toBe("current");
    expect(modelChoices(models, "not-listed").some((choice) => choice.description.includes("current"))).toBe(false);
  });

  it("offers the way to type a name even when nothing was listed", () => {
    expect(modelChoices([]).map((choice) => choice.custom)).toEqual([true]);
  });
});

describe("initialModelIndex", () => {
  const choices = modelChoices([{ id: "a" }, { id: "b" }, { id: "c" }]);

  it("starts on the model already in use if it is listed", () => {
    expect(initialModelIndex(choices, "c")).toBe(2);
  });

  it("starts on the first model otherwise", () => {
    expect(initialModelIndex(choices)).toBe(0);
    expect(initialModelIndex(choices, "gone")).toBe(0);
  });

  it("never starts on the way-out entry, even if a model is named like it", () => {
    expect(initialModelIndex(choices, CUSTOM_MODEL_NAME)).toBe(0);
  });
});

describe("windowOf", () => {
  const items = Array.from({ length: 20 }, (_, index) => index);

  it("shows everything when the list fits", () => {
    expect(windowOf([1, 2, 3], 1, 8)).toEqual({ items: [1, 2, 3], selected: 1 });
    expect(windowOf([], 0, 8)).toEqual({ items: [], selected: 0 });
  });

  it("keeps the selection inside a window of the given size, wherever it is", () => {
    for (let selected = 0; selected < items.length; selected++) {
      const shown = windowOf(items, selected, 8);
      expect(shown.items).toHaveLength(8);
      expect(shown.items[shown.selected]).toBe(selected);
    }
  });

  it("stays at the top at the start and at the bottom at the end, instead of running past either", () => {
    expect(windowOf(items, 0, 8).items[0]).toBe(0);
    expect(windowOf(items, 19, 8).items.at(-1)).toBe(19);
  });

  it("scrolls with the selection, keeping it near the middle", () => {
    expect(windowOf(items, 10, 8)).toEqual({ items: [6, 7, 8, 9, 10, 11, 12, 13], selected: 4 });
  });
});
