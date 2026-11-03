/**
 * Which projects the user has trusted to run their own hooks and MCP servers, and to allow their own commands. A repository
 * can ship a `.cortex/settings.json`, so opening one must not run its commands until the user has said so. The answer is
 * remembered in `~/.cortex/trust.json`: user level, outside any workspace (so the agent's file tools cannot reach it), and
 * written readable by the owner only.
 *
 * A trust record is tied to a fingerprint of what the project asks for, not just to its folder. When those settings change
 * (a `git pull`, a teammate's edit, the agent's own) the old answer no longer applies and the user is asked again.
 *
 * This module only stores answers. Deciding what needs trust is settings.ts's job; asking is the app's.
 */
import { createHash, randomBytes } from "node:crypto";
import { promises as fs, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function trustPath(home = homedir()): string {
  return path.join(home, ".cortex", "trust.json");
}

/** Most projects remembered; past this the oldest answers are forgotten (and asked about again), so the file cannot grow without bound. */
export const MAX_TRUSTED_PROJECTS = 500;

interface TrustRecord {
  fingerprint: string;
  trustedAt: string;
}

interface TrustFile {
  projects: Record<string, TrustRecord>;
}

// ---- Keys and fingerprints -------------------------------------------------------

/**
 * The same project always gets the same key: its real location (links followed), in lower case where the file system ignores
 * case, so `D:\Work\App`, `d:\work\app` and a link to it are one project.
 */
export function projectKey(cwd: string): string {
  const resolved = path.resolve(cwd);
  let real = resolved;
  try {
    real = realpathSync.native(resolved);
  } catch {
    /* a folder that does not exist (yet) is keyed by how it was written */
  }
  return process.platform === "win32" || process.platform === "darwin" ? real.toLowerCase() : real;
}

/** JSON with object keys in sorted order, so the same content always gives the same text. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A short stable hash of whatever a project asks to be trusted with. The same requests always hash the same; any change does not. */
export function fingerprintRequests(requests: unknown): string {
  return createHash("sha256").update(stableStringify(requests)).digest("hex");
}

// ---- The store -------------------------------------------------------------------

/** Reads the store. A missing, unreadable or malformed file means nothing is trusted: failing closed beats blocking startup. */
async function readTrust(home: string): Promise<TrustFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(trustPath(home), "utf-8")) as { projects?: unknown };
    const projects: Record<string, TrustRecord> = {};
    if (typeof parsed.projects === "object" && parsed.projects !== null) {
      for (const [key, value] of Object.entries(parsed.projects)) {
        const record = value as Partial<TrustRecord> | null;
        if (typeof record?.fingerprint === "string") {
          projects[key] = { fingerprint: record.fingerprint, trustedAt: typeof record.trustedAt === "string" ? record.trustedAt : "" };
        }
      }
    }
    return { projects };
  } catch {
    return { projects: {} };
  }
}

/** Whether the user has trusted this project with exactly these requests. */
export async function isProjectTrusted(cwd: string, fingerprint: string, home = homedir()): Promise<boolean> {
  return (await readTrust(home)).projects[projectKey(cwd)]?.fingerprint === fingerprint;
}

/**
 * Remembers that the user trusts this project with exactly these requests. Written to a new file with an unpredictable name
 * (never one that already exists, never through a link) and renamed into place, so a crash or an attacker cannot leave a
 * half-written or world-readable store; the temporary file is removed if anything goes wrong.
 */
export async function trustProject(cwd: string, fingerprint: string, home = homedir()): Promise<void> {
  const store = await readTrust(home);
  store.projects[projectKey(cwd)] = { fingerprint, trustedAt: new Date().toISOString() };

  const kept = Object.entries(store.projects)
    .sort(([, a], [, b]) => (a.trustedAt < b.trustedAt ? 1 : a.trustedAt > b.trustedAt ? -1 : 0))
    .slice(0, MAX_TRUSTED_PROJECTS);

  const file = trustPath(home);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify({ projects: Object.fromEntries(kept) }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
