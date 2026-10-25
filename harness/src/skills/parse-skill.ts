import type { Skill } from "./types";

/** Minimal `---` frontmatter parser: flat `key: value` lines only. */
export function parseSkill(source: string, fallbackName: string): Skill {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  const meta: Record<string, string> = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "");
  }
  return { name: meta.name ?? fallbackName, description: meta.description ?? "", body: (m ? m[2]! : source).trim() };
}
