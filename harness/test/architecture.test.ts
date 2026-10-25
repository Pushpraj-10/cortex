import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** Dependency direction: each folder may import only the folders listed. Leaves depend on nothing. */
const ALLOWED: Record<string, string[]> = {
  llm: [],
  tools: [],
  permissions: [],
  hooks: [],
  mcp: ["tools"],
  skills: ["tools"],
  context: ["llm", "permissions"],
  config: ["hooks", "mcp", "permissions"],
  agent: ["context", "hooks", "llm", "permissions", "tools"],
  subagents: ["agent", "tools"],
  cli: ["agent", "config", "context", "llm", "mcp", "permissions", "skills", "subagents", "tools"],
};

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (name.endsWith(".ts")) yield full;
  }
}

describe("architecture", () => {
  it("every src folder is declared in the dependency map", () => {
    const folders = readdirSync(SRC).filter((n) => statSync(join(SRC, n)).isDirectory());
    expect(folders.sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it("modules only import from folders they are allowed to depend on", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const owner = relative(SRC, file).split(sep)[0]!;
      if (!(owner in ALLOWED)) continue; // src/index.ts, the public barrel, may import anything
      for (const m of readFileSync(file, "utf8").matchAll(/from "(\.\.?\/[^"]+)"/g)) {
        const target = relative(SRC, resolve(dirname(file), m[1]!)).split(sep)[0]!;
        if (target !== owner && !ALLOWED[owner]!.includes(target)) {
          violations.push(`${relative(SRC, file)} -> ${target}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
