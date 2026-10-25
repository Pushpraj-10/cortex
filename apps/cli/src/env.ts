import { readFileSync } from "node:fs";
import path from "node:path";

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
 * Loads a .env file (default: `.env` in the current working directory) into
 * `process.env`, without overwriting variables the shell already exported — a real
 * exported env var always wins over the file. The file is optional; a missing one is
 * silently ignored.
 */
export function loadDotEnv(filePath: string = path.resolve(process.cwd(), ".env")): void {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }

  for (const [key, value] of Object.entries(parseDotEnv(source))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
