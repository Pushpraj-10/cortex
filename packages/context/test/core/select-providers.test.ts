import { describe, expect, it, vi } from "vitest";
import { ok } from "@cortex/shared";
import { selectProviders } from "../../src/core/select-providers.js";
import type { ContextProvider } from "../../src/core/context-provider.js";

const request = { workspaceRoot: "/repo", userMessage: "hi" };

function provider(id: string, applies?: ContextProvider["applies"]): ContextProvider {
  return { id, displayName: id, applies, gather: async () => ok([]) };
}

describe("selectProviders", () => {
  it("keeps a provider that has no applies()", async () => {
    const selected = await selectProviders([provider("always")], request);
    expect(selected.map((p) => p.id)).toEqual(["always"]);
  });

  it("drops providers whose applies() is false and keeps registration order for the rest", async () => {
    const selected = await selectProviders(
      [provider("a", () => true), provider("b", () => false), provider("c", async () => true)],
      request,
    );
    expect(selected.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("passes the request to applies()", async () => {
    const applies = vi.fn().mockReturnValue(true);
    await selectProviders([provider("spy", applies)], request);
    expect(applies).toHaveBeenCalledWith(request);
  });

  it("treats a throwing applies() as not applying and logs a warning", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const selected = await selectProviders(
      [
        provider("throws", () => {
          throw new Error("boom");
        }),
        provider("ok"),
      ],
      request,
      logger,
    );
    expect(selected.map((p) => p.id)).toEqual(["ok"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("treats a rejecting applies() as not applying", async () => {
    const selected = await selectProviders([provider("rejects", async () => Promise.reject(new Error("boom")))], request);
    expect(selected).toEqual([]);
  });
});
