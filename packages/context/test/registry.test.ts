import { ok } from "@cortex/core";
import { describe, expect, it } from "vitest";
import { registerContextProvider, getContextProvider, listContextProviders, UnknownContextProviderError } from "../src/registry.js";
import type { ContextProvider } from "../src/types.js";

{
  function fakeProvider(id: string): ContextProvider {
    return { id, gather: async () => ok([]) };
  }

  describe("context provider registry", () => {
    it("registers and retrieves a provider by id", () => {
      const provider = fakeProvider("registry-test-a");
      registerContextProvider(provider);
      expect(getContextProvider("registry-test-a")).toBe(provider);
    });

    it("throws UnknownContextProviderError for an unregistered id", () => {
      expect(() => getContextProvider("registry-test-nonexistent")).toThrow(UnknownContextProviderError);
    });

    it("lists all registered providers", () => {
      registerContextProvider(fakeProvider("registry-test-b"));
      expect(listContextProviders().map((p) => p.id)).toContain("registry-test-b");
    });
  });
}
