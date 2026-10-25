import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "../src/provider-config.js";
import {
  PROVIDER_FIELDS,
  currentField,
  describeStatus,
  maskValue,
  promptHint,
  startSetup,
  submitField,
} from "../src/provider-setup.js";

describe("PROVIDER_FIELDS", () => {
  it("asks something for every provider, and only ever treats the API key as secret", () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_FIELDS[id].length).toBeGreaterThan(0);
      for (const field of PROVIDER_FIELDS[id]) expect(field.secret).toBe(field.key === "apiKey");
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
    const afterModel = submitField(startSetup("ollama"), "llama3.1");
    expect(afterModel.kind).toBe("next");

    const done = submitField((afterModel as { state: ReturnType<typeof startSetup> }).state, "");
    expect(done).toEqual({ kind: "done", provider: "ollama", values: { model: "llama3.1" } });
  });

  it("collects an optional field when it is given", () => {
    const afterModel = submitField(startSetup("ollama"), "llama3.1") as { state: ReturnType<typeof startSetup> };
    expect(submitField(afterModel.state, "http://gpu-box:11434")).toEqual({
      kind: "done",
      provider: "ollama",
      values: { model: "llama3.1", baseUrl: "http://gpu-box:11434" },
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
    const afterModel = submitField(startSetup("ollama", { baseUrl: "http://box:1" }), "llama3.1") as { state: ReturnType<typeof startSetup> };
    expect(promptHint(afterModel.state)).toBe('enter keeps "http://box:1"');
    expect(promptHint(startSetup("ollama", { model: "m" }))).toBe('enter keeps "m"');

    const optionalFresh = submitField(startSetup("ollama"), "llama3.1") as { state: ReturnType<typeof startSetup> };
    expect(promptHint(optionalFresh.state)).toBe("optional — enter to skip");
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
