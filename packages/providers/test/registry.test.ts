import { describe, expect, it } from "vitest";
import { UnknownProviderError, getLlmProvider, registerLlmProvider } from "../src/registry.js";
import type { LLMProviderDescriptor } from "../src/types.js";

const descriptor = (id: string, displayName = id): LLMProviderDescriptor => ({
  id,
  displayName,
  createClient: () => ({ chat: async () => ({ ok: true, value: { role: "assistant", content: "" } }) }),
});

describe("provider registry", () => {
  it("returns a registered descriptor by id", () => {
    const d = descriptor("registry-test-a");
    registerLlmProvider(d);
    expect(getLlmProvider("registry-test-a")).toBe(d);
  });

  it("replaces a descriptor registered twice under the same id", () => {
    registerLlmProvider(descriptor("registry-test-b", "first"));
    registerLlmProvider(descriptor("registry-test-b", "second"));
    expect(getLlmProvider("registry-test-b").displayName).toBe("second");
  });

  it("throws UnknownProviderError for an unregistered id", () => {
    expect(() => getLlmProvider("registry-test-missing")).toThrow(UnknownProviderError);
  });
});
