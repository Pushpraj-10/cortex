import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_BASE_URLS, PROVIDER_ENV, PROVIDER_IDS } from "../provider/config.js";

// ---- parse-dot-env ----

/** Parses `KEY=VALUE` lines from a .env file's contents. Blank lines and `#` comments are skipped. */
export function parseDotEnv(source: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

// ---- load-dot-env ----

/**
 * The variables a project's `.env` may set: Cortex's own provider settings (which provider, and each one's model and API
 * key) and nothing else. The `.env` in the working directory belongs to whoever wrote the project, and what it sets is
 * inherited by every command, hook and MCP server Cortex starts, so letting it set `NODE_OPTIONS`, `PATH` or `BASH_ENV`
 * would run its code, and letting it set a provider's server URL would send your saved API key to a server of its choosing.
 * Server URLs are set in the shell, or (for Ollama) with /provider.
 */
export const PROJECT_ENV_ALLOWED: ReadonlySet<string> = new Set([
  "CORTEX_PROVIDER",
  ...PROVIDER_IDS.flatMap((id) => [PROVIDER_ENV[id].apiKey, PROVIDER_ENV[id].model].filter((name): name is string => name !== undefined)),
]);

/** A name that looks like it was meant for Cortex or one of its providers, so a refusal is worth telling the user about. */
const CORTEX_FLAVOURED = /^(?:CORTEX|OLLAMA|GOOGLE|ANTHROPIC)_/;

/** A provider's server URL variable set to that provider's usual address changes nothing, so refusing it needs no mention (it is what `.env.example` has). */
function isDefaultBaseUrl(key: string, value: string): boolean {
  const id = PROVIDER_IDS.find((candidate) => PROVIDER_ENV[candidate].baseUrl === key);
  return id !== undefined && value.trim().replace(/\/+$/, "") === DEFAULT_BASE_URLS[id];
}

/**
 * Loads a .env file (default: `.env` in the current working directory) into `env` (default `process.env`), but only the
 * variables in `PROJECT_ENV_ALLOWED`, and without overwriting variables the shell already exported — a real exported env
 * var always wins over the file. The file is optional; a missing one is silently ignored.
 *
 * Returns the names it refused that look meant for Cortex (a provider's server URL that is not the usual one, any other
 * `CORTEX_`/`OLLAMA_`/`GOOGLE_`/`ANTHROPIC_` variable), for the app to mention. Other variables are skipped without comment:
 * a project's `.env` is full of its own settings, which are none of Cortex's business.
 */
export function loadDotEnv(filePath: string = path.resolve(process.cwd(), ".env"), env: NodeJS.ProcessEnv = process.env): string[] {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const refused: string[] = [];
  for (const [key, value] of Object.entries(parseDotEnv(source))) {
    if (env[key] !== undefined) continue;
    if (PROJECT_ENV_ALLOWED.has(key)) env[key] = value;
    else if (CORTEX_FLAVOURED.test(key) && !isDefaultBaseUrl(key, value)) refused.push(key);
  }
  return refused;
}
