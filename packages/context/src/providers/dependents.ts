/**
 * Dependents provider: lists which files import the files the user's message names, i.e. the ripple of an edit.
 */
import { ok } from "@cortex/core";
import { type Dependent, findDependents, getImportGraph } from "../graph.js";
import { isSourceFile } from "../imports.js";
import type { ContextProvider } from "../types.js";
import { extractFileMentions, resolveRequestMentions } from "../workspace.js";

// ---- Formatting ----

/** One mentioned file and the files that depend on it. */
export interface DependentsEntry {
  file: string;
  dependents: Dependent[];
  /** True when the dependents list was cut off by its cap, so the model knows it's partial. */
  truncated: boolean;
}

/**
 * Renders, per file, who imports it directly and who is affected further out, nearest
 * first. Files nothing depends on are left out; returns "" when nothing is left. Pure — no IO.
 */
export function formatDependents(entries: DependentsEntry[]): string {
  return entries
    .filter((entry) => entry.dependents.length > 0)
    .map((entry) => {
      const lines = [entry.file];

      const maxDepth = Math.max(...entry.dependents.map((dependent) => dependent.depth));
      for (let depth = 1; depth <= maxDepth; depth += 1) {
        const files = entry.dependents.filter((dependent) => dependent.depth === depth).map((dependent) => dependent.file);
        if (files.length === 0) continue;
        const label = depth === 1 ? "imported by" : `affected via ${depth} hops`;
        lines.push(`  ${label}: ${files.join(", ")}`);
      }

      if (entry.truncated) lines.push("  (list capped; more files depend on this)");
      return lines.join("\n");
    })
    .join("\n\n");
}

// ---- The provider ----

const MAX_DEPENDENTS_PER_FILE = 30;

/**
 * For each source file the user's message names, lists the files that import it — and the
 * files that import those — so the model sees the ripple of an edit before making one.
 * Backed by an import graph that is indexed once per workspace and then refreshed
 * incrementally (see `getImportGraph`), so asking every turn costs a `stat` per file, not a
 * full re-scan. Paths only, ranked below the files themselves so it's the first thing dropped
 * when the context block runs long.
 */
export const dependentsProvider: ContextProvider = {
  id: "dependents",
  applies: (request) => extractFileMentions(request.userMessage).some(isSourceFile),
  async gather(request) {
    const mentioned = await resolveRequestMentions(request);
    const files = mentioned.filter(isSourceFile);
    if (files.length === 0) return ok([]);

    const graph = await getImportGraph(request.workspaceRoot, request.signal);

    const entries: DependentsEntry[] = files.map((file) => {
      const dependents = findDependents(graph, file, { maxResults: MAX_DEPENDENTS_PER_FILE });
      return { file, dependents, truncated: dependents.length >= MAX_DEPENDENTS_PER_FILE };
    });

    const content = formatDependents(entries);
    if (!content) return ok([]);

    return ok([{ providerId: "dependents", title: "Files that depend on these", content, relevance: 0.4 }]);
  },
};
