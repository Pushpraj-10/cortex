/**
 * The pure side of showing a tool call's preview: the diff for a file change (computed once per preview),
 * the numbers for a header like `+3 −1`, and how many terminal rows a preview takes. The approval prompt is
 * a fixed-height box, so the row count has to be exact; that is why it lives here, next to what draws it.
 */
import type { ToolPreview } from "@cortex/tools";
import { diffText, type Diff } from "../../format/diff.js";

export type DiffPreview = Extract<ToolPreview, { kind: "diff" }>;
export type CommandPreview = Extract<ToolPreview, { kind: "command" }>;

const diffs = new WeakMap<DiffPreview, Diff>();

/** The diff a file-change preview describes. Cached, because the screen redraws far more often than a preview changes. */
export function diffOf(preview: DiffPreview): Diff {
  let diff = diffs.get(preview);
  if (!diff) {
    diff = diffText(preview.before, preview.after, { startLine: preview.startLine });
    diffs.set(preview, diff);
  }
  return diff;
}

export function commandLines(preview: CommandPreview): string[] {
  return preview.command.split("\n");
}

/** Lines added and removed by a file change, and whether it creates the file; undefined for any other preview. */
export function changeStats(preview: ToolPreview | undefined): { added: number; removed: number; isNew: boolean } | undefined {
  if (preview?.kind !== "diff") return undefined;
  const { added, removed } = diffOf(preview);
  return { added, removed, isNew: preview.isNew === true };
}

/**
 * Rows a preview takes when drawn at most `maxLines` tall, one row per line: the lines shown, plus one for the
 * "N more lines" note when some are left out. Zero for no preview, or for a change that changes nothing.
 */
export function previewRows(preview: ToolPreview | undefined, maxLines: number): number {
  if (!preview) return 0;
  const total = preview.kind === "diff" ? diffOf(preview).rows.length : commandLines(preview).length;
  const shown = Math.min(total, Math.max(0, maxLines));
  return shown + (total > shown ? 1 : 0);
}
