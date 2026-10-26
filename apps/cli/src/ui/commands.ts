/**
 * Slash commands typed into the input box. They act on the UI and the session (clear it, switch
 * the permission mode, quit) and never reach the model.
 */
import { AGENT_MODE_IDS, getAgentMode, isAgentModeId, listAgentModes, type AgentModeId } from "@cortex/agent";
import { PERMISSION_MODES, isPermissionMode, type PermissionMode } from "@cortex/policy";
import { PROVIDER_IDS, isProviderId, type ProviderId } from "../provider/config.js";
import { THEME_NAMES, isThemeName, type ThemeName } from "./theme/themes.js";
import type { SlashCommand } from "./types.js";

export const slashCommands: SlashCommand[] = [
  { name: "help", description: "Show commands and keyboard shortcuts" },
  { name: "clear", description: "Start a new conversation" },
  { name: "mode", description: "Show or set the permission mode" },
  { name: "agent", description: "Show or switch the agent (scan, suggest, fix)" },
  { name: "provider", description: "Set up a provider's API key and model" },
  { name: "model", description: "Show the active model and provider" },
  { name: "theme", description: "Show or switch the color theme" },
  { name: "quit", description: "Exit Cortex" },
];

export const HELP_TEXT = [
  "Commands:",
  ...slashCommands.map((command) => `  /${command.name.padEnd(6)} ${command.description}`),
  "",
  "Keys: enter send · shift+enter newline · shift+tab next mode · esc interrupt · ctrl+t expand last tool call · ctrl+c quit",
  `Modes: ${PERMISSION_MODES.join(" | ")}`,
  `Agents: ${AGENT_MODE_IDS.join(" | ")} — /agent <name> switches; /agent off returns to the general agent`,
  `Providers: ${PROVIDER_IDS.join(" | ")} — /provider <name> sets one up; /provider remove <name> forgets its saved key`,
  `Themes: ${THEME_NAMES.join(" | ")} — /theme <name> switches and remembers it`,
].join("\n");

/** What a command can do. The UI supplies these; the command logic itself stays pure and testable. */
export interface CommandHost {
  mode: PermissionMode;
  model: string;
  provider: string;
  theme: ThemeName;
  setMode(mode: PermissionMode): void;
  /** The active agent (scan, suggest, fix); undefined is the general agent. */
  agent: AgentModeId | undefined;
  setAgent(agent: AgentModeId | undefined): void;
  /** Switches the colours now and remembers the choice. */
  setTheme(theme: ThemeName): void;
  /** Starts the guided setup, at the picker or straight at one provider. */
  openProviderSetup(provider?: ProviderId): void;
  removeProvider(provider: ProviderId): void;
  clear(): void;
  quit(): void;
  /** Shows a one-off line in the transcript. */
  notify(text: string): void;
}

/**
 * Runs `line` if it is a slash command and returns true; returns false for ordinary messages. Only
 * `/word` counts as a command, so a message that merely starts with a path like `/etc/hosts` is
 * still sent to the model. An unrecognised `/word` is reported instead of being sent.
 */
export function runSlashCommand(line: string, host: CommandHost): boolean {
  const [head = "", ...rest] = line.trim().split(/\s+/);
  if (!/^\/[a-z]+$/i.test(head)) return false;

  switch (head.slice(1).toLowerCase()) {
    case "help":
      host.notify(HELP_TEXT);
      break;
    case "clear":
      host.clear();
      break;
    case "model":
      host.notify(`Model: ${host.model} (${host.provider})`);
      break;
    case "quit":
      host.quit();
      break;
    case "theme": {
      const requested = rest[0];
      if (requested === undefined) {
        host.notify(`Theme: ${host.theme}. Set one with /theme <${THEME_NAMES.join("|")}>.`);
      } else if (isThemeName(requested)) {
        host.setTheme(requested);
        host.notify(`Theme: ${requested}`);
      } else {
        host.notify(`Unknown theme "${requested}". Use one of: ${THEME_NAMES.join(", ")}.`);
      }
      break;
    }
    case "provider": {
      const [first, second] = rest;
      if (first === undefined) {
        host.openProviderSetup();
      } else if (first === "remove") {
        if (isProviderId(second)) host.removeProvider(second);
        else host.notify(`Usage: /provider remove <${PROVIDER_IDS.join("|")}>`);
      } else if (isProviderId(first)) {
        host.openProviderSetup(first);
      } else {
        host.notify(`Unknown provider "${first}". Use one of: ${PROVIDER_IDS.join(", ")}.`);
      }
      break;
    }
    case "agent": {
      const requested = rest[0];
      if (requested === undefined) {
        host.notify(
          [
            `Agent: ${host.agent ?? "none (general agent)"}. Set one with /agent <${AGENT_MODE_IDS.join("|")}|off>.`,
            ...listAgentModes().map((agent) => `  ${agent.id.padEnd(7)} ${agent.description}`),
          ].join("\n"),
        );
      } else if (requested.toLowerCase() === "off") {
        host.setAgent(undefined);
        host.notify("Agent: off (general agent)");
      } else if (isAgentModeId(requested)) {
        host.setAgent(requested);
        // Plan mode denies every edit, which includes saving the report, so say so rather than let it fail mid-task.
        const planNote = host.mode === "plan" ? " Plan mode is on, so edits and saving reports are denied; change it with /mode." : "";
        host.notify(`Agent: ${requested} — ${getAgentMode(requested).description}.${planNote}`);
      } else {
        host.notify(`Unknown agent "${requested}". Use one of: ${AGENT_MODE_IDS.join(", ")}, or off.`);
      }
      break;
    }
    case "mode": {
      const requested = rest[0];
      if (requested === undefined) {
        host.notify(`Mode: ${host.mode}. Set one with /mode <${PERMISSION_MODES.join("|")}>.`);
      } else if (isPermissionMode(requested)) {
        host.setMode(requested);
        host.notify(`Mode: ${requested}`);
      } else {
        host.notify(`Unknown mode "${requested}". Use one of: ${PERMISSION_MODES.join(", ")}.`);
      }
      break;
    }
    default:
      host.notify(`Unknown command ${head}. Type /help for the list.`);
  }
  return true;
}
