import { describe, expect, it, vi } from "vitest";
import { ok, err, CortexError } from "@cortex/core";
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

  it("skips a provider whose applies() is false, without calling its gather()", async () => {
    const skipped = vi.fn().mockResolvedValue(ok([{ providerId: "skipped", title: "Skipped", content: "x" }]));
    const providers: ContextProvider[] = [
      { id: "skipped", displayName: "skipped", applies: () => false, gather: skipped },
      providerReturning("ok", async () => ok([{ providerId: "ok", title: "OK", content: "here" }])),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(skipped).not.toHaveBeenCalled();
    expect(result).toBe("# Workspace Context\n\n## OK\nhere");
  });

  it("orders fragments by relevance, highest first, regardless of provider order", async () => {
    const providers = [
      providerReturning("overview", async () => ok([{ providerId: "overview", title: "Overview", content: "o", relevance: 0.1 }])),
      providerReturning("file", async () => ok([{ providerId: "file", title: "File", content: "f", relevance: 1 }])),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(result).toBe("# Workspace Context\n\n## File\nf\n\n## Overview\no");
  });

  it("drops a fragment that duplicates one from another provider", async () => {
    const same = { providerId: "x", title: "Same", content: "same" };
    const providers = [providerReturning("a", async () => ok([same])), providerReturning("b", async () => ok([same]))];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers });

    expect(result).toBe("# Workspace Context\n\n## Same\nsame");
  });

  it("trims the lowest-ranked context to fit maxChars and says so", async () => {
    const providers = [
      providerReturning("big", async () =>
        ok([
          { providerId: "big", title: "Important", content: "i".repeat(200), relevance: 1 },
          { providerId: "big", title: "Background", content: "b".repeat(200), relevance: 0.1 },
        ]),
      ),
    ];

    const result = await gatherContext({ workspaceRoot: "/repo", userMessage: "hi" }, { providers, maxChars: 215 });

    expect(result).toContain("## Important");
    expect(result).not.toContain("## Background");
    expect(result).toContain("## Omitted context");
  });

  it("passes the request through to each provider", async () => {
    const gather = vi.fn().mockResolvedValue(ok([]));
    const providers = [providerReturning("spy", gather)];
    const request = { workspaceRoot: "/repo", userMessage: "what is this project?" };

    await gatherContext(request, { providers });

    expect(gather).toHaveBeenCalledWith(request);
  });
});
