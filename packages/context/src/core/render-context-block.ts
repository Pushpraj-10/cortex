import type { ContextFragment } from "../types.js";

/** Renders fragments into one block, one Markdown heading per fragment. Empty input renders "". */
export function renderContextBlock(fragments: ContextFragment[]): string {
  if (fragments.length === 0) return "";

  const sections = fragments.map((fragment) => `## ${fragment.title}\n${fragment.content}`);
  return ["# Workspace Context", ...sections].join("\n\n");
}
