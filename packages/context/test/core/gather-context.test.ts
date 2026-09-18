import { describe, expect, it, vi } from "vitest";
import { ok, err, CortexError } from "@cortex/shared";
import { gatherContext } from "../../src/core/gather-context.js";
import type { ContextProvider } from "../../src/core/context-provider.js";

function providerReturning(id: string, gather: ContextProvider["gather"]): ContextProvider {
  return { id, displayName: id, gather };
}

describe("gatherContext", () => {
  it("calls every provider and renders their combined fragments", async () => {
    const providers = [
      providerReturning("a", async () => ok([{ providerId: "a", title: "A", content: "content a" }])),
      providerReturning("b", async () => ok([{ providerId: "b", title: "B", content: "content b" }])),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(result).toBe("# Workspace Context\n\n## A\ncontent a\n\n## B\ncontent b");
  });

  it("isolates a provider that returns an error Result, without affecting other providers", async () => {
    const providers = [
      providerReturning("failing", async () => err(new CortexError("boom", "TEST_BOOM"))),
      providerReturning("ok", async () => ok([{ providerId: "ok", title: "OK", content: "still here" }])),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(result).toBe("# Workspace Context\n\n## OK\nstill here");
  });

  it("isolates a provider whose gather() throws synchronously, without affecting other providers", async () => {
    const providers = [
      providerReturning("throws", () => {
        throw new Error("synchronous boom");
      }),
      providerReturning("ok", async () => ok([{ providerId: "ok", title: "OK", content: "still here" }])),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(result).toBe("# Workspace Context\n\n## OK\nstill here");
  });

  it("isolates a provider whose gather() returns a rejected promise, without affecting other providers", async () => {
    const providers = [
      providerReturning("rejects", async () => {
        throw new Error("async boom");
      }),
      providerReturning("ok", async () => ok([{ providerId: "ok", title: "OK", content: "still here" }])),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(result).toBe("# Workspace Context\n\n## OK\nstill here");
  });

  it("returns an empty string when there are no registered providers", async () => {
    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers: [] });
    expect(result).toBe("");
  });

  it("returns an empty string when every provider contributes nothing", async () => {
    const providers = [providerReturning("empty", async () => ok([]))];
    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });
    expect(result).toBe("");
  });

  it("logs a warning for a failing provider without throwing", async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const providers = [providerReturning("failing", async () => err(new CortexError("boom", "TEST_BOOM")))];

    await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers, logger });

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("passes the request through to each provider", async () => {
    const gather = vi.fn().mockResolvedValue(ok([]));
    const providers = [providerReturning("spy", gather)];
    const request = { workspaceRoot: "/repo", userMessage: "what is this project?" };

    await gatherContext(request, { providers });

    expect(gather).toHaveBeenCalledWith(request);
  });
});
