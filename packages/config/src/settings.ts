/**
 * Layered settings. `~/.cortex/settings.json` (user) and `<workspace>/.cortex/settings.json`
 * (project) are merged: permission rules, hooks and MCP servers accumulate, and for the same MCP
 * server name or the default mode the project wins. A missing file is fine; a malformed one is an
 * error, because silently ignoring a security-relevant file (deny rules, hooks) is worse than stopping.
 */
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { McpServerConfig } from "@cortex/extensions";
import { isPermissionMode, type HookDef, type PermissionMode, type PermissionRules } from "@cortex/policy";

export interface Settings {
  permissions: PermissionRules & { defaultMode?: PermissionMode };
  hooks: HookDef[];
  mcpServers: Record<string, McpServerConfig>;
}

type SettingsFile = Partial<{
  permissions: Partial<PermissionRules> & { defaultMode?: unknown };
  hooks: HookDef[];
  mcpServers: Record<string, McpServerConfig>;
}>;

async function readSettingsFile(file: string): Promise<SettingsFile> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  let parsed: SettingsFile;
  try {
    parsed = JSON.parse(text) as SettingsFile;
  } catch (error) {
    throw new Error(`Invalid settings file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const mode = parsed.permissions?.defaultMode;
  if (mode !== undefined && !isPermissionMode(mode)) {
    throw new Error(`Invalid settings file ${file}: permissions.defaultMode "${String(mode)}" is not a permission mode`);
  }
  return parsed;
}

export async function loadSettings(cwd: string, home = homedir()): Promise<Settings> {
  const layers = [
    await readSettingsFile(path.join(home, ".cortex", "settings.json")),
    await readSettingsFile(path.join(cwd, ".cortex", "settings.json")),
  ];

  const merged: Settings = { permissions: { allow: [], deny: [] }, hooks: [], mcpServers: {} };
  for (const layer of layers) {
    merged.permissions.allow.push(...(layer.permissions?.allow ?? []));
    merged.permissions.deny.push(...(layer.permissions?.deny ?? []));
    if (layer.permissions?.defaultMode) merged.permissions.defaultMode = layer.permissions.defaultMode as PermissionMode;
    merged.hooks.push(...(layer.hooks ?? []));
    Object.assign(merged.mcpServers, layer.mcpServers);
  }
  return merged;
}
