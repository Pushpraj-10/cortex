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
