import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist"]);

/** Yields file paths relative to `root` (forward slashes), skipping vendored/build dirs. */
export async function* walkFiles(root: string, dir = root): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(root, full);
    else yield relative(root, full).split("\\").join("/");
  }
}
