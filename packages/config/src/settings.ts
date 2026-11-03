/**
 * Layered settings. `~/.cortex/settings.json` (user) and `<workspace>/.cortex/settings.json`
 * (project) are merged: permission rules, hooks and MCP servers accumulate, and for the same MCP
 * server name or the default mode the project wins. A missing file is fine; a malformed one is an
 * error, because silently ignoring a security-relevant file (deny rules, hooks) is worse than stopping.
 *
 * The project file is written by whoever wrote the repository, so what it can make Cortex *do* needs the user's
 * say-so: its hooks, MCP servers and allow rules run or grant commands (see `projectRequests`, and trust.ts for
 * remembering the answer). What can only make Cortex more careful (deny rules, plan mode) needs none.
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

export type SettingsFile = Partial<{
  permissions: Partial<PermissionRules> & { defaultMode?: PermissionMode };
  hooks: HookDef[];
  mcpServers: Record<string, McpServerConfig>;
}>;

// ---- Reading and checking a file -------------------------------------------------

const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Checks the shape of a parsed settings file and returns it typed, or says what is wrong. The file may come from a
 * repository, and what it holds ends up in a shell command or a process to start, so nothing is taken on faith.
 */
function checkSettings(parsed: unknown, file: string): SettingsFile {
  const invalid = (reason: string) => new Error(`Invalid settings file ${file}: ${reason}`);
  if (!isRecord(parsed)) throw invalid("it must be a JSON object");

  const { permissions, hooks, mcpServers } = parsed;

  if (permissions !== undefined) {
    if (!isRecord(permissions)) throw invalid("permissions must be an object");
    for (const list of ["allow", "deny"] as const) {
      if (permissions[list] !== undefined && !isStringArray(permissions[list])) throw invalid(`permissions.${list} must be a list of rule strings`);
    }
    const mode = permissions.defaultMode;
    if (mode !== undefined && !isPermissionMode(mode)) throw invalid(`permissions.defaultMode "${String(mode)}" is not a permission mode`);
  }

  if (hooks !== undefined) {
    if (!Array.isArray(hooks)) throw invalid("hooks must be a list");
    hooks.forEach((hook, index) => {
      if (!isRecord(hook) || !HOOK_EVENTS.includes(hook.event as string)) throw invalid(`hooks[${index}].event must be one of ${HOOK_EVENTS.join(", ")}`);
      if (typeof hook.command !== "string" || hook.command.trim() === "") throw invalid(`hooks[${index}].command must be a non-empty string`);
      if (hook.matcher !== undefined && typeof hook.matcher !== "string") throw invalid(`hooks[${index}].matcher must be a string`);
      if (typeof hook.matcher === "string") {
        try {
          new RegExp(`^(?:${hook.matcher})$`);
        } catch {
          // A hook that cannot say which calls it covers cannot be allowed to quietly cover none of them.
          throw invalid(`hooks[${index}].matcher is not a valid regular expression`);
        }
      }
    });
  }

  if (mcpServers !== undefined) {
    if (!isRecord(mcpServers)) throw invalid("mcpServers must be an object");
    for (const [name, server] of Object.entries(mcpServers)) {
      if (!isRecord(server) || typeof server.command !== "string" || server.command.trim() === "") throw invalid(`mcpServers.${name}.command must be a non-empty string`);
      if (server.args !== undefined && !isStringArray(server.args)) throw invalid(`mcpServers.${name}.args must be a list of strings`);
      if (server.env !== undefined && !(isRecord(server.env) && Object.values(server.env).every((value) => typeof value === "string"))) {
        throw invalid(`mcpServers.${name}.env must map names to strings`);
      }
    }
  }

  return parsed as SettingsFile;
}

async function readSettingsFile(file: string): Promise<SettingsFile> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid settings file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return checkSettings(parsed, file);
}

export interface SettingsLayers {
  user: SettingsFile;
  project: SettingsFile;
}

/** Reads the user's settings and the project's, separately, so what the project asks for can be weighed before it takes effect. */
export async function readSettingsLayers(cwd: string, home = homedir()): Promise<SettingsLayers> {
  return {
    user: await readSettingsFile(path.join(home, ".cortex", "settings.json")),
    project: await readSettingsFile(path.join(cwd, ".cortex", "settings.json")),
  };
}

// ---- What a project asks to be trusted with --------------------------------------

/** The parts of a project's settings that make Cortex run or permit commands, and so need the user's say-so. */
export interface ProjectRequests {
  mcpServers: Record<string, McpServerConfig>;
  hooks: HookDef[];
  /** Rules that let a call through without asking. */
  allow: string[];
  /** Only a mode that lets the agent do more than `default` (acceptEdits, bypassPermissions); a stricter one needs no trust. */
  defaultMode?: PermissionMode;
}

const ESCALATING_MODES: readonly PermissionMode[] = ["acceptEdits", "bypassPermissions"];

export function projectRequests(project: SettingsFile): ProjectRequests {
  const mode = project.permissions?.defaultMode;
  return {
    mcpServers: project.mcpServers ?? {},
    hooks: project.hooks ?? [],
    allow: project.permissions?.allow ?? [],
    ...(mode && ESCALATING_MODES.includes(mode) ? { defaultMode: mode } : {}),
  };
}

export const hasProjectRequests = (requests: ProjectRequests): boolean =>
  Object.keys(requests.mcpServers).length > 0 || requests.hooks.length > 0 || requests.allow.length > 0 || requests.defaultMode !== undefined;

// ---- Merging ---------------------------------------------------------------------

/**
 * User settings, then the project's. With `trustProject` false the project contributes only what makes Cortex more careful:
 * its deny rules and a default mode no looser than `default`. Everything in `projectRequests` is left out.
 */
export function mergeSettings(layers: SettingsLayers, options: { trustProject: boolean }): Settings {
  const merged: Settings = { permissions: { allow: [], deny: [] }, hooks: [], mcpServers: {} };

  const add = (layer: SettingsFile, trusted: boolean) => {
    const requests = projectRequests(layer);
    merged.permissions.deny.push(...(layer.permissions?.deny ?? []));

    const mode = layer.permissions?.defaultMode;
    if (mode && (trusted || !ESCALATING_MODES.includes(mode))) merged.permissions.defaultMode = mode;

    if (!trusted) return;
    merged.permissions.allow.push(...requests.allow);
    merged.hooks.push(...requests.hooks);
    Object.assign(merged.mcpServers, requests.mcpServers);
  };

  add(layers.user, true);
  add(layers.project, options.trustProject);
  return merged;
}

/**
 * Both layers, merged. `trustProject` defaults to true, which is what a caller that has already settled the question wants
 * (and what the settings tests exercise); the app passes the user's answer.
 */
export async function loadSettings(cwd: string, home = homedir(), options: { trustProject: boolean } = { trustProject: true }): Promise<Settings> {
  return mergeSettings(await readSettingsLayers(cwd, home), options);
}
