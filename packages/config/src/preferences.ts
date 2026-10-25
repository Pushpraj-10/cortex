/**
 * Cosmetic user preferences (today: the UI theme) in `~/.cortex/preferences.json`. Kept apart from
 * settings.json, which is security-relevant and rejects bad content, and from credentials.json, which
 * holds keys: a damaged preferences file must never stop the app, so it is read as "nothing chosen".
 *
 * Like credentials, this module is generic: the theme is just a string here, and the UI validates it.
 */
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface Preferences {
  theme?: string;
}

export function preferencesPath(home = homedir()): string {
  return path.join(home, ".cortex", "preferences.json");
}

/** Reads the saved preferences; a missing, unreadable or malformed file is an empty result. */
export async function loadPreferences(home = homedir()): Promise<Preferences> {
  let parsed: { theme?: unknown };
  try {
    parsed = JSON.parse(await fs.readFile(preferencesPath(home), "utf-8")) as typeof parsed;
  } catch {
    return {};
  }
  const theme = typeof parsed?.theme === "string" && parsed.theme.trim() !== "" ? parsed.theme.trim() : undefined;
  return theme ? { theme } : {};
}

/** Merges `values` over what was saved. Written through a temporary file and a rename so a crash can't leave half a file. */
export async function savePreferences(values: Preferences, home = homedir()): Promise<void> {
  const merged = { ...(await loadPreferences(home)), ...values };
  const file = preferencesPath(home);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`);
  await fs.rename(temporary, file);
}
