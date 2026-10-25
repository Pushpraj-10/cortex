/**
 * Saved provider settings — API keys, models, server URLs — so a user can configure a provider from
 * inside the app instead of editing environment files. They live in `~/.cortex/credentials.json`:
 * user level only, never the project (whose `.cortex/settings.json` may be committed), and written with
 * owner-only permissions. The file is plain text, protected by those permissions (on Windows, by your
 * profile folder's access rules); keep a key out of it by using an environment variable instead.
 *
 * This module is deliberately provider-agnostic: provider ids are just strings here.
 */
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface StoredProvider {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface Credentials {
  /** The provider to use when none is chosen explicitly. */
  activeProvider?: string;
  providers: Record<string, StoredProvider>;
}

const FIELDS = ["apiKey", "model", "baseUrl"] as const;

export function credentialsPath(home = homedir()): string {
  return path.join(home, ".cortex", "credentials.json");
}

/** Keeps only the known fields, as trimmed non-empty strings. */
function clean(raw: unknown): StoredProvider {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const cleaned: StoredProvider = {};
  for (const field of FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.trim() !== "") cleaned[field] = value.trim();
  }
  return cleaned;
}

/**
 * Reads the saved settings; a missing file is an empty result. A malformed file throws with the file's
 * path — but never its contents, which may hold a key.
 */
export async function loadCredentials(home = homedir()): Promise<Credentials> {
  const file = credentialsPath(home);
  let text: string;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { providers: {} };
    throw error;
  }

  let parsed: { activeProvider?: unknown; providers?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(`Invalid credentials file ${file}: not valid JSON. Fix or delete it.`);
  }

  const providers: Record<string, StoredProvider> = {};
  if (typeof parsed.providers === "object" && parsed.providers !== null) {
    for (const [id, value] of Object.entries(parsed.providers)) providers[id] = clean(value);
  }
  const active = typeof parsed.activeProvider === "string" && parsed.activeProvider !== "" ? parsed.activeProvider : undefined;
  return { ...(active ? { activeProvider: active } : {}), providers };
}

/** Writes via a temporary file and a rename, so a crash can never leave a half-written (or world-readable) file. */
async function write(credentials: Credentials, home: string): Promise<void> {
  const file = credentialsPath(home);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
}

/**
 * Saves values for one provider, merged over what was already saved for it (so unchanged fields
 * survive). With `activate`, it also becomes the default provider.
 */
export async function saveProviderCredentials(
  provider: string,
  values: StoredProvider,
  options: { home?: string; activate?: boolean } = {},
): Promise<void> {
  const home = options.home ?? homedir();
  const credentials = await loadCredentials(home);
  credentials.providers[provider] = { ...credentials.providers[provider], ...clean(values) };
  if (options.activate) credentials.activeProvider = provider;
  await write(credentials, home);
}

/** Forgets everything saved for a provider (and the default, if it was that provider). Returns whether anything was saved. */
export async function removeProviderCredentials(provider: string, home = homedir()): Promise<boolean> {
  const credentials = await loadCredentials(home);
  const existed = provider in credentials.providers;
  if (!existed && credentials.activeProvider !== provider) return false;

  delete credentials.providers[provider];
  if (credentials.activeProvider === provider) delete credentials.activeProvider;
  await write(credentials, home);
  return existed;
}
