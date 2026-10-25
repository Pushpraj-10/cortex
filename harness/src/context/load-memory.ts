import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Project (`CORTEX.md` in cwd) and user (`~/.cortex/CORTEX.md`) instructions, concatenated. Missing files are skipped. */
export async function loadMemory(cwd: string, home = homedir()): Promise<string> {
  const sources: [string, string][] = [
    ["User instructions", join(home, ".cortex", "CORTEX.md")],
    ["Project instructions", join(cwd, "CORTEX.md")],
  ];
  const parts: string[] = [];
  for (const [label, path] of sources) {
    try {
      parts.push(`# ${label}\n${(await readFile(path, "utf8")).trim()}`);
    } catch {
      /* not present */
    }
  }
  return parts.join("\n\n");
}
