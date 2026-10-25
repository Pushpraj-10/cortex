import { ok, err, CortexError } from "@cortex/core";
import { describe, expect, it, vi } from "vitest";
import { selectProviders, dedupeFragments, rankFragments, applyBudget, renderContextBlock, gatherContext } from "../src/pipeline.js";
import type { ContextProvider } from "../src/types.js";

{
  const request = { workspaceRoot: "/repo", userMessage: "hi" };

  function provider(id: string, applies?: ContextProvider["applies"]): ContextProvider {
    return { id, applies, gather: async () => ok([]) };
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
}

{
  const fragment = (providerId: string, title: string, content: string) => ({ providerId, title, content });

  describe("dedupeFragments", () => {
    it("drops a later fragment with the same title and content, keeping the first", () => {
      const result = dedupeFragments([fragment("a", "T", "same"), fragment("b", "T", "same")]);
      expect(result).toEqual([fragment("a", "T", "same")]);
    });

    it("keeps fragments that differ in title or in content", () => {
      const input = [fragment("a", "T", "one"), fragment("a", "T", "two"), fragment("a", "U", "one")];
      expect(dedupeFragments(input)).toEqual(input);
    });

    it("does not confuse a title/content split with a different one", () => {
      const input = [fragment("a", "ab", "c"), fragment("a", "a", "bc")];
      expect(dedupeFragments(input)).toEqual(input);
    });

    it("returns an empty array for empty input", () => {
      expect(dedupeFragments([])).toEqual([]);
    });
  });
}

{
  const fragment = (title: string, relevance?: number) => ({ providerId: "p", title, content: "c", relevance });

  describe("rankFragments", () => {
    it("orders by relevance, highest first", () => {
      const result = rankFragments([fragment("low", 0.1), fragment("high", 1), fragment("mid", 0.5)]);
      expect(result.map((f) => f.title)).toEqual(["high", "mid", "low"]);
    });

    it("treats a missing relevance as 0", () => {
      const result = rankFragments([fragment("none"), fragment("some", 0.2)]);
      expect(result.map((f) => f.title)).toEqual(["some", "none"]);
    });

    it("keeps incoming order among equal relevance", () => {
      const result = rankFragments([fragment("first", 0.5), fragment("second", 0.5), fragment("third", 0.5)]);
      expect(result.map((f) => f.title)).toEqual(["first", "second", "third"]);
    });

    it("does not mutate its input", () => {
      const input = [fragment("low", 0.1), fragment("high", 1)];
      rankFragments(input);
      expect(input.map((f) => f.title)).toEqual(["low", "high"]);
    });
  });
}

{
  const fragment = (title: string, content: string) => ({ providerId: "p", title, content });

  describe("applyBudget", () => {
    it("returns everything untouched when it fits", () => {
      const input = [fragment("A", "aaa"), fragment("B", "bbb")];
      expect(applyBudget(input, 1000)).toEqual(input);
    });

    it("truncates the fragment that crosses the budget and drops everything after it", () => {
      const input = [fragment("A", "a".repeat(100)), fragment("B", "b".repeat(500)), fragment("C", "c".repeat(10))];

      const result = applyBudget(input, 400);

      expect(result[0]).toEqual(input[0]);
      expect(result[1]?.title).toBe("B");
      expect(result[1]?.content.endsWith("[truncated]")).toBe(true);
      expect(result[1]?.content.length).toBeLessThan(500);
      expect(result.some((f) => f.title === "C")).toBe(false);
    });

    it("keeps the rendered block within the budget, ignoring only the omitted-note", () => {
      const input = [fragment("A", "a".repeat(300)), fragment("B", "b".repeat(300))];

      const result = applyBudget(input, 450);
      const withoutNote = result.filter((f) => f.providerId !== "context");

      expect(renderContextBlock(withoutNote).length).toBeLessThanOrEqual(450 + "# Workspace Context\n\n".length);
    });

    it("adds a note saying how many sections were left out", () => {
      const input = [fragment("A", "a".repeat(300)), fragment("B", "b"), fragment("C", "c")];

      const result = applyBudget(input, 310);

      const note = result[result.length - 1];
      expect(note?.title).toBe("Omitted context");
      expect(note?.content).toContain("2 lower-priority");
    });

    it("drops (rather than truncates) a fragment when too little of it would survive", () => {
      const input = [fragment("A", "a".repeat(100)), fragment("B", "b".repeat(500))];

      const result = applyBudget(input, 120);

      expect(result.map((f) => f.title)).toEqual(["A", "Omitted context"]);
    });

    it("adds no note when nothing was dropped", () => {
      expect(applyBudget([fragment("A", "a")], 1000).some((f) => f.title === "Omitted context")).toBe(false);
    });

    it("returns an empty array for empty input", () => {
      expect(applyBudget([], 100)).toEqual([]);
    });
  });
}

describe("renderContextBlock", () => {
  it("returns an empty string for no fragments", () => {
    expect(renderContextBlock([])).toBe("");
  });

  it("renders one fragment as a heading under the workspace-context header", () => {
    const result = renderContextBlock([{ providerId: "a", title: "Workspace Overview", content: "some content" }]);
    expect(result).toBe("# Workspace Context\n\n## Workspace Overview\nsome content");
  });

  it("renders multiple fragments as separate sections in order", () => {
    const result = renderContextBlock([
      { providerId: "a", title: "First", content: "one" },
      { providerId: "b", title: "Second", content: "two" },
    ]);
    expect(result).toBe("# Workspace Context\n\n## First\none\n\n## Second\ntwo");
  });
});

{
  function providerReturning(id: string, gather: ContextProvider["gather"]): ContextProvider {
    return { id, gather };
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
        { id: "skipped", applies: () => false, gather: skipped },
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
}
