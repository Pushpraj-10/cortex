import { describe, expect, it } from "vitest";
import { ok } from "@cortex/shared";
import { registerProvider, getProvider, listProviders, UnknownProviderError } from "../../src/core/provider-registry.js";
import type { ContextProvider } from "../../src/core/context-provider.js";

function fakeProvider(id: string): ContextProvider {
  return { id, displayName: id, gather: async () => ok([]) };
}

describe("context provider registry", () => {
  it("registers and retrieves a provider by id", () => {
    const provider = fakeProvider("registry-test-a");
    registerProvider(provider);
    expect(getProvider("registry-test-a")).toBe(provider);
  });

  it("throws UnknownProviderError for an unregistered id", () => {
    expect(() => getProvider("registry-test-nonexistent")).toThrow(UnknownProviderError);
  });

  it("lists all registered providers", () => {
    registerProvider(fakeProvider("registry-test-b"));
    expect(listProviders().map((p) => p.id)).toContain("registry-test-b");
  });
});
