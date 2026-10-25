import type { Dependent } from "../../graph/types.js";

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
