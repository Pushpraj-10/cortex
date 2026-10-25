/**
 * What the right side of the footer shows at a given width: the model first, then how full the context is, then the git
 * branch, then the folder. Parts are added in that order while they fit, so a narrow terminal loses the folder first and
 * the model last. Pure: the component only colours what this returns.
 */
import { shortenPath } from "./path.js";
import { displayWidth } from "./table.js";

export interface StatusParts {
  model: string;
  /** Estimated tokens in the conversation and the size at which it is compacted; absent before the first request. */
  context?: { used: number; budget: number };
  branch?: string;
  cwd: string;
}

export interface StatusSegment {
  kind: "model" | "context" | "branch" | "cwd";
  text: string;
}

/** Columns between parts (` · `). */
const SEPARATOR_WIDTH = 3;
/** A folder squeezed below this says too little to be worth the room. */
const MIN_CWD_WIDTH = 8;

/** How full the context is, 0 to 100; it can pass the budget for an instant before compaction, so it is capped. */
export function contextPercent(context: { used: number; budget: number }): number {
  if (context.budget <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((context.used / context.budget) * 100)));
}

/** The segments that fit in `available` columns, in the order they are shown: model, context, folder, branch. */
export function layoutStatus(parts: StatusParts, available: number): StatusSegment[] {
  if (displayWidth(parts.model) > available) return [{ kind: "model", text: shortenEnd(parts.model, available) }];

  const chosen: Partial<Record<StatusSegment["kind"], string>> = { model: parts.model };
  let used = displayWidth(parts.model);
  const room = () => available - used - SEPARATOR_WIDTH;

  if (parts.context) {
    const text = `${contextPercent(parts.context)}% context`;
    if (displayWidth(text) <= room()) {
      chosen.context = text;
      used += SEPARATOR_WIDTH + displayWidth(text);
    }
  }
  if (parts.branch) {
    const text = `(${parts.branch})`;
    if (displayWidth(text) <= room()) {
      chosen.branch = text;
      used += SEPARATOR_WIDTH + displayWidth(text);
    }
  }
  if (room() >= MIN_CWD_WIDTH && parts.cwd !== "") chosen.cwd = shortenPath(parts.cwd, room());

  return (["model", "context", "cwd", "branch"] as const).flatMap((kind) => (chosen[kind] === undefined ? [] : [{ kind, text: chosen[kind]! }]));
}

/** Cuts text that is too long at its end, with `…`. */
function shortenEnd(text: string, max: number): string {
  if (max <= 1) return "…".slice(0, Math.max(0, max));
  let result = "";
  for (const char of text) {
    if (displayWidth(result + char) > max - 1) break;
    result += char;
  }
  return `${result}…`;
}
