/**
 * The messages typed in a project, kept between sessions so up-arrow and ctrl+r can recall them. One file per project
 * under `~/.cortex/history/` (named by a hash of the project's folder, so a message typed in one repo is not offered in
 * another), user level only and owner-only like credentials. Each line is one JSON string, so a multi-line message stays on
 * one line and a damaged line costs only itself.
 *
 * Like preferences, a missing or damaged file must never stop the app: it reads as "no history". What gets in is the
 * caller's decision; this module only refuses blank text and the very long (a pasted log is not worth recalling).
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** How many messages are loaded (the newest ones). */
export const MAX_HISTORY_ENTRIES = 500;
/** A longer message is not saved. */
export const MAX_HISTORY_ENTRY_CHARS = 10_000;
/** Past this size the file is rewritten with only the newest entries, so it cannot grow without bound. */
const COMPACT_ABOVE_BYTES = 256 * 1024;

/** Where the history of the project at `cwd` is kept. Windows paths are case-insensitive, so they are hashed in lower case. */
export function historyPath(cwd: string, home = homedir()): string {
  const resolved = path.resolve(cwd);
  const key = createHash("sha256")
    .update(process.platform === "win32" ? resolved.toLowerCase() : resolved)
    .digest("hex")
    .slice(0, 16);
  return path.join(home, ".cortex", "history", `${key}.jsonl`);
}

/** The usable entries of a history file's text, oldest first, at most the newest `MAX_HISTORY_ENTRIES`. */
function parse(text: string): string[] {
  const entries: string[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const value: unknown = JSON.parse(line);
      if (typeof value === "string" && value.trim() !== "") entries.push(value);
    } catch {
      // a damaged line is skipped
    }
  }
  return entries.slice(-MAX_HISTORY_ENTRIES);
}

/** The saved messages for the project at `cwd`, oldest first. Never throws: a missing or unreadable file is no history. */
export async function loadHistory(cwd: string, home = homedir()): Promise<string[]> {
  try {
    return parse(await fs.readFile(historyPath(cwd, home), "utf-8"));
  } catch {
    return [];
  }
}

/** Rewrites the file with only the newest entries, through a temporary file and a rename. */
async function compact(file: string): Promise<void> {
  const kept = parse(await fs.readFile(file, "utf-8"));
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, kept.map((entry) => `${JSON.stringify(entry)}\n`).join(""), { mode: 0o600 });
  await fs.rename(temporary, file);
}

/**
 * Adds one message to the project's history. Blank and over-long text is ignored. The file is created owner-only (`0600`,
 * folder `0700`; on Windows the bits are not enforced and your profile folder's rules protect it). Rejects when the file
 * cannot be written; a caller that does not want to interrupt the session for that catches it.
 */
export async function appendHistory(cwd: string, text: string, home = homedir()): Promise<void> {
  if (text.trim() === "" || text.length > MAX_HISTORY_ENTRY_CHARS) return;
  const file = historyPath(cwd, home);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.appendFile(file, `${JSON.stringify(text)}\n`, { mode: 0o600 });
  if ((await fs.stat(file)).size > COMPACT_ABOVE_BYTES) await compact(file);
}
