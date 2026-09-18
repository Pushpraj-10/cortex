import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDotEnv } from "./parse-dot-env.js";

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
