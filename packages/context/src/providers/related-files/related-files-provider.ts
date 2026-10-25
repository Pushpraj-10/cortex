import { ok } from "@cortex/shared";
import type { ContextProvider } from "../../core/context-provider.js";
import { extractFileMentions } from "../../workspace/extract-file-mentions.js";
import { resolveMentionedFiles } from "../../workspace/resolve-mentioned-files.js";
import { readFileExcerpt } from "../../workspace/read-file-excerpt.js";
import { extractImports } from "../../workspace/extract-imports.js";
import { resolveImportPath } from "../../workspace/resolve-import-path.js";
import { findRelatedTests } from "../../workspace/find-related-tests.js";
import { formatRelatedFiles, type RelatedFilesEntry } from "./format-related-files.js";

/** Imports live at the top of a file; no need to read more than this to find them. */
const IMPORT_SCAN_CHARS = 20_000;

/**
 * For each file the user's message names, lists the workspace files it imports and the
 * tests that cover it — paths only, so it costs little and tells the model where to look
 * next. Complements `mentionedFilesProvider`, which supplies the file contents themselves.
 */
export const relatedFilesProvider: ContextProvider = {
  id: "related-files",
  displayName: "Related Files",
  applies: (request) => extractFileMentions(request.userMessage).length > 0,
  async gather(request) {
    const files = await resolveMentionedFiles(request.workspaceRoot, extractFileMentions(request.userMessage));

    const entries: RelatedFilesEntry[] = [];
    for (const file of files) {
      const source = await readFileExcerpt(request.workspaceRoot, file, IMPORT_SCAN_CHARS);
      const imports = source.ok ? await resolveImports(request.workspaceRoot, file, source.value) : [];
      const tests = await findRelatedTests(request.workspaceRoot, file);
      entries.push({ file, imports, tests });
    }

    const content = formatRelatedFiles(entries);
    if (!content) return ok([]);

    return ok([{ providerId: "related-files", title: "Related files", content, relevance: 0.5 }]);
  },
};

async function resolveImports(workspaceRoot: string, file: string, source: string): Promise<string[]> {
  const resolved: string[] = [];
  for (const specifier of extractImports(source)) {
    const target = await resolveImportPath(workspaceRoot, file, specifier);
    if (target && !resolved.includes(target)) resolved.push(target);
  }
  return resolved;
}
