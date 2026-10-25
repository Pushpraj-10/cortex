/**
 * `@file` completion, as pure functions: finding the `@word` being typed, ranking the workspace's files against it, and
 * splicing the chosen path in.
 *
 * `@` is only the trigger. Accepting a completion replaces `@query` with the plain relative path (`src/a.ts `), because
 * that is what `@cortex/context`'s mentioned-files provider recognises and attaches to the turn: a literal `@src/a.ts`
 * would be read as a scoped package name and the file would not be attached.
 */

// ---- Finding the mention being typed ----

export interface ActiveMention {
  /** Offset of the `@` in the text. */
  start: number;
  /** What has been typed after it. */
  query: string;
}

/**
 * The `@query` that ends at the cursor, if there is one. The `@` has to start the text or follow whitespace, so an email
 * address or a scoped package (`name@host`, `x@y`) is never mistaken for a mention.
 */
export function activeMention(value: string, cursor: number): ActiveMention | undefined {
  const before = value.slice(0, cursor);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return undefined;
  const query = match[1]!;
  return { start: before.length - query.length - 1, query };
}

/**
 * The text with the mention replaced by `path`, and where the cursor goes. A space follows the path unless whitespace
 * already does, and the cursor ends up past it so typing carries on.
 */
export function completeMention(value: string, cursor: number, mention: ActiveMention, path: string): { value: string; cursor: number } {
  const tail = value.slice(cursor);
  const head = value.slice(0, mention.start) + path + (/^\s/.test(tail) ? "" : " ");
  return { value: head + tail, cursor: head.length + (tail.startsWith(" ") ? 1 : 0) };
}

// ---- Ranking files ----

/** How many matches the menu shows. */
export const MAX_FILE_MATCHES = 8;

// Each kind of match beats every weaker kind, whatever the paths look like; within a kind shorter and shallower paths win.
const TIER_EXACT_NAME = 5000;
const TIER_NAME_PREFIX = 4000;
const TIER_IN_NAME = 3000;
const TIER_IN_PATH = 2000;
const TIER_SCATTERED = 1000;
const DEPTH_PENALTY = 3;

const depthOf = (file: string) => file.split("/").length - 1;

/** How far apart the first and last of the query's letters fall when they appear in order in `text`; undefined when they do not. */
function scatteredSpan(needle: string, text: string): number | undefined {
  let next = 0;
  let first = -1;
  for (const letter of needle) {
    next = text.indexOf(letter, next);
    if (next === -1) return undefined;
    if (first === -1) first = next;
    next += 1;
  }
  return next - first;
}

function scoreFile(file: string, needle: string): number | undefined {
  const path = file.toLowerCase();
  const name = path.slice(path.lastIndexOf("/") + 1);

  let tier: number;
  if (name === needle) tier = TIER_EXACT_NAME;
  else if (name.startsWith(needle)) tier = TIER_NAME_PREFIX;
  else if (name.includes(needle)) tier = TIER_IN_NAME;
  else if (path.includes(needle)) tier = TIER_IN_PATH;
  else {
    const span = scatteredSpan(needle, path);
    if (span === undefined) return undefined;
    tier = TIER_SCATTERED - span;
  }
  return tier - path.length - depthOf(file) * DEPTH_PENALTY;
}

/**
 * The best matches for `query` among `files` (`/`-separated, workspace-relative), best first: the exact file name, then
 * names that start with it, contain it, paths that contain it, and last paths holding its letters in order. With no query
 * it is the shallowest files, so the root's own files come first.
 */
export function rankFiles(files: readonly string[], query: string, limit = MAX_FILE_MATCHES): string[] {
  const needle = query.toLowerCase().replace(/\\/g, "/");

  if (!needle) {
    return [...files].sort((a, b) => depthOf(a) - depthOf(b) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, limit);
  }

  const scored: { file: string; score: number }[] = [];
  for (const file of files) {
    const score = scoreFile(file, needle);
    if (score !== undefined) scored.push({ file, score });
  }
  scored.sort((a, b) => b.score - a.score || a.file.length - b.file.length || (a.file < b.file ? -1 : 1));
  return scored.slice(0, limit).map((entry) => entry.file);
}
