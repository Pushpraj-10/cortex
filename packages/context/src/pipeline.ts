/**
 * The per-turn pipeline behind gatherContext: select applicable providers, gather from them in parallel with failure isolation,
 * drop duplicates, rank by relevance, fit a size budget and render one text block for the model.
 */
import type { Logger } from "@cortex/core";
import { listContextProviders } from "./registry.js";
import type { ContextProvider, ContextRequest, ContextFragment } from "./types.js";

// ---- Step 1: choose the providers that apply to this request ----

/**
 * Keeps the providers that apply to this request, preserving registration order. A
 * provider without `applies` always applies; one whose `applies` throws or rejects is
 * treated as not applying, so a buggy predicate can never break a turn.
 */
export async function selectProviders(
  providers: ContextProvider[],
  request: ContextRequest,
  logger?: Logger,
): Promise<ContextProvider[]> {
  const verdicts = await Promise.all(
    providers.map(async (provider): Promise<boolean> => {
      if (!provider.applies) return true;
      try {
        return await provider.applies(request);
      } catch (error) {
        logger?.warn(`context provider "${provider.id}" applies() threw`, { error: String(error) });
        return false;
      }
    }),
  );

  return providers.filter((_, index) => verdicts[index]);
}

// ---- Step 3: drop exact duplicates ----

/** Drops fragments whose title and content exactly match an earlier one, keeping the first. */
export function dedupeFragments(fragments: ContextFragment[]): ContextFragment[] {
  const seen = new Set<string>();
  return fragments.filter((fragment) => {
    const key = `${fragment.title}\u0000${fragment.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---- Step 4: most relevant first ----

/** Orders fragments by `relevance`, highest first; fragments with equal relevance keep their incoming order. */
export function rankFragments(fragments: ContextFragment[]): ContextFragment[] {
  return [...fragments].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

// ---- Step 5: fit the size budget ----

const TRUNCATION_MARKER = "\n[truncated]";
/** Per-fragment rendering overhead: "## ", the newline after the title, and the blank line between sections. */
const FRAGMENT_OVERHEAD = 6;
/** A truncated fragment is only worth keeping if at least this much of its content survives. */
const MIN_USEFUL_CONTENT = 80;

/**
 * Keeps fragments, in the order given, until `maxChars` is used up. The fragment that
 * crosses the line is truncated (if enough of it fits to be useful); everything after
 * it is dropped, so a lower-ranked fragment never jumps ahead of a higher-ranked one.
 * When anything was dropped a short note says so, so the model knows the list is partial.
 */
export function applyBudget(fragments: ContextFragment[], maxChars: number): ContextFragment[] {
  const kept: ContextFragment[] = [];
  let remaining = maxChars;
  let omitted = 0;

  for (const fragment of fragments) {
    if (remaining <= 0) {
      omitted += 1;
      continue;
    }

    const cost = fragment.title.length + fragment.content.length + FRAGMENT_OVERHEAD;
    if (cost <= remaining) {
      kept.push(fragment);
      remaining -= cost;
      continue;
    }

    const room = remaining - fragment.title.length - FRAGMENT_OVERHEAD - TRUNCATION_MARKER.length;
    if (room >= MIN_USEFUL_CONTENT) {
      kept.push({ ...fragment, content: fragment.content.slice(0, room) + TRUNCATION_MARKER });
    } else {
      omitted += 1;
    }
    remaining = 0;
  }

  if (omitted > 0) {
    kept.push({
      providerId: "context",
      title: "Omitted context",
      content: `${omitted} lower-priority context section(s) were left out to stay within the size budget.`,
    });
  }

  return kept;
}

// ---- Step 6: render the block the model sees ----

/** Renders fragments into one block, one Markdown heading per fragment. Empty input renders "". */
export function renderContextBlock(fragments: ContextFragment[]): string {
  if (fragments.length === 0) return "";

  const sections = fragments.map((fragment) => `## ${fragment.title}\n${fragment.content}`);
  return ["# Workspace Context", ...sections].join("\n\n");
}

// ---- The pipeline itself (step 2 gathers from the selected providers) ----

/** About 3k tokens — enough for a couple of files plus an overview without crowding the conversation. */
const DEFAULT_MAX_CHARS = 12_000;

export interface GatherContextDeps {
  /** Defaults to every registered provider; overridable for tests. */
  providers?: ContextProvider[];
  logger?: Logger;
  /** Upper bound on the rendered block's size, in characters. Defaults to 12,000. */
  maxChars?: number;
}

/**
 * Assembles the context block for one turn: skips providers that don't apply to the
 * request, queries the rest in parallel (isolating each one's failure so a single bad
 * provider can never break a turn), then drops duplicates, orders what's left by
 * relevance, trims it to the size budget and renders it into one text block.
 * Returns "" when no provider had anything to contribute — never a heading with
 * nothing under it.
 */
export async function gatherContext(request: ContextRequest, deps: GatherContextDeps = {}): Promise<string> {
  const registered = deps.providers ?? listContextProviders();
  if (registered.length === 0) return "";

  const providers = await selectProviders(registered, request, deps.logger);

  const perProvider = await Promise.all(
    providers.map(async (provider): Promise<ContextFragment[]> => {
      try {
        const result = await provider.gather(request);
        if (!result.ok) {
          deps.logger?.warn(`context provider "${provider.id}" failed`, { error: result.error.message });
          return [];
        }
        return result.value;
      } catch (error) {
        deps.logger?.warn(`context provider "${provider.id}" threw`, { error: String(error) });
        return [];
      }
    }),
  );

  const ranked = rankFragments(dedupeFragments(perProvider.flat()));
  return renderContextBlock(applyBudget(ranked, deps.maxChars ?? DEFAULT_MAX_CHARS));
}
