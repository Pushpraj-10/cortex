/**
 * Related-files provider: attaches the imports and tests of the files the user's message names.
 */
import { ok } from "@cortex/core";
import { extractImports, resolveImportPath } from "../imports.js";
import type { ContextProvider } from "../types.js";
import { extractFileMentions, resolveRequestMentions, readFileExcerpt, findRelatedTests } from "../workspace.js";

// ---- Formatting ----

const MAX_IMPORTS_PER_FILE = 15;

/** What is known about one mentioned file's neighbours. Paths are workspace-relative. */
export interface RelatedFilesEntry {
  file: string;
  imports: string[];
  tests: string[];
}

/**
 * Renders each file's local imports and tests as a short indented listing. Files with
 * neither are left out; returns "" when nothing is left. Pure — no IO.
 */
export function formatRelatedFiles(entries: RelatedFilesEntry[]): string {
  return entries
    .filter((entry) => entry.imports.length > 0 || entry.tests.length > 0)
    .map((entry) => {
      const lines = [entry.file];
      if (entry.imports.length > 0) {
        const shown = entry.imports.slice(0, MAX_IMPORTS_PER_FILE);
        const more = entry.imports.length - shown.length;
        lines.push(`  imports: ${shown.join(", ")}${more > 0 ? `, … (${more} more)` : ""}`);
      }
      if (entry.tests.length > 0) lines.push(`  tests: ${entry.tests.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

// ---- The provider ----

/** Imports live at the top of a file; no need to read more than this to find them. */
const IMPORT_SCAN_CHARS = 20_000;

/**
 * For each file the user's message names, lists the workspace files it imports and the
 * tests that cover it — paths only, so it costs little and tells the model where to look
 * next. Complements `mentionedFilesProvider`, which supplies the file contents themselves.
 */
export const relatedFilesProvider: ContextProvider = {
  id: "related-files",
  applies: (request) => extractFileMentions(request.userMessage).length > 0,
  async gather(request) {
    const files = await resolveRequestMentions(request);

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
