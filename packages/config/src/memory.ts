/**
 * Memory files: free-form instructions the user keeps in markdown, added to the system prompt.
 * `~/.cortex/CORTEX.md` applies everywhere; `<workspace>/CORTEX.md` applies to one project.
 */
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** User then project instructions, each under a heading. Missing files are skipped; returns "" if there are none. */
export async function loadMemory(cwd: string, home = homedir()): Promise<string> {
  const sources: [heading: string, file: string][] = [
    ["User instructions", path.join(home, ".cortex", "CORTEX.md")],
    ["Project instructions", path.join(cwd, "CORTEX.md")],
  ];

  const sections: string[] = [];
  for (const [heading, file] of sources) {
    try {
      sections.push(`# ${heading}\n${(await fs.readFile(file, "utf-8")).trim()}`);
    } catch {
      /* not present */
    }
  }
  return sections.join("\n\n");
}
