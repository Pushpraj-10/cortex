import { ok } from "@cortex/shared";
import type { ContextProvider } from "../../core/context-provider.js";
import { findDependents } from "../../graph/find-dependents.js";
import { getImportGraph } from "../../graph/get-import-graph.js";
import { isSourceFile } from "../../graph/is-source-file.js";
import { extractFileMentions } from "../../workspace/extract-file-mentions.js";
import { resolveMentionedFiles } from "../../workspace/resolve-mentioned-files.js";
import { formatDependents, type DependentsEntry } from "./format-dependents.js";

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
  displayName: "Dependents",
  applies: (request) => extractFileMentions(request.userMessage).some(isSourceFile),
  async gather(request) {
    const mentioned = await resolveMentionedFiles(request.workspaceRoot, extractFileMentions(request.userMessage));
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
