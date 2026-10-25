import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Settings } from "./types";

async function readJson(path: string): Promise<Partial<Settings>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Partial<Settings>;
  } catch {
    return {};
  }
}

/** Merges `~/.cortex/settings.json` then `<cwd>/.cortex/settings.json`; lists concatenate, project scalars win. */
export async function loadSettings(cwd: string, home = homedir()): Promise<Settings> {
  const layers = [await readJson(join(home, ".cortex", "settings.json")), await readJson(join(cwd, ".cortex", "settings.json"))];
  const merged: Settings = { permissions: { allow: [], deny: [] }, hooks: [], mcpServers: {} };
  for (const l of layers) {
    merged.permissions.allow.push(...(l.permissions?.allow ?? []));
    merged.permissions.deny.push(...(l.permissions?.deny ?? []));
    if (l.permissions?.defaultMode) merged.permissions.defaultMode = l.permissions.defaultMode;
    merged.hooks.push(...(l.hooks ?? []));
    Object.assign(merged.mcpServers, l.mcpServers);
  }
  return merged;
}
