/**
 * The app's version, for the header. The bundled build has a package.json next to cortex.js; running
 * from source finds apps/cli/package.json two folders above this file. Neither found means "dev".
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CANDIDATES = ["./package.json", "../../package.json"];

export function readVersion(base: string | URL = import.meta.url): string {
  for (const relative of CANDIDATES) {
    try {
      const manifest = JSON.parse(readFileSync(fileURLToPath(new URL(relative, base)), "utf-8")) as { version?: unknown };
      if (typeof manifest.version === "string") return manifest.version;
    } catch {
      /* not here; try the next place */
    }
  }
  return "dev";
}
