/**
 * Enforces the folder layering inside apps/cli, the same way tests/architecture.test.ts does for packages,
 * so the structure described in the README can't quietly rot:
 *
 *   index.ts -> cli/ -> runtime/ -> provider/        (cli/ also uses format/)
 *   index.ts -> ui/  -> provider/, format/           (ui/ sees runtime/ for types only)
 *
 * provider/ and format/ are leaves; nothing but index.ts imports ui/, so a screen change can never
 * leak into the code that starts the app or talks to the provider.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

/** Top-level folder under src/ -> the folders its files may import from (besides itself). */
const ALLOWED: Record<string, string[]> = {
  cli: ["runtime", "provider", "format"],
  runtime: ["provider"],
  provider: [],
  format: [],
  ui: ["provider", "format", "runtime"],
};

/** Folders `ui/` may import from for types only (`import type`), never for values. */
const TYPE_ONLY_FROM_UI = ["runtime"];

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

interface LocalImport {
  /** The src/ folder the import lands in, or "" for a file directly in src/. */
  folder: string;
  typeOnly: boolean;
}

function localImports(file: string): LocalImport[] {
  const text = readFileSync(file, "utf8");
  const imports: LocalImport[] = [];
  for (const match of text.matchAll(/^(?:import|export)\s+(type\s+)?[^;]*?\sfrom\s+"(\.{1,2}\/[^"]+)"/gm)) {
    const segments = relative(SRC, resolve(dirname(file), match[2]!)).split(sep);
    imports.push({ folder: segments.length > 1 ? segments[0]! : "", typeOnly: match[1] !== undefined });
  }
  return imports;
}

const posix = (file: string) => relative(SRC, file).split(sep).join("/");

describe("apps/cli layering", () => {
  it("keeps src/ to index.ts plus the known folders", () => {
    expect(readdirSync(SRC).sort()).toEqual(["cli", "format", "index.ts", "provider", "runtime", "ui"]);
  });

  for (const [folder, allowed] of Object.entries(ALLOWED)) {
    it(`${folder}/ imports only ${[folder, ...allowed].join(", ")}`, () => {
      const offenders: string[] = [];
      for (const file of sourceFiles(join(SRC, folder))) {
        for (const imported of localImports(file)) {
          if (imported.folder !== folder && !allowed.includes(imported.folder)) offenders.push(`${posix(file)} -> ${imported.folder || "src root"}/`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it("lets ui/ use runtime/ for types only", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(SRC, "ui"))) {
      for (const imported of localImports(file)) {
        if (TYPE_ONLY_FROM_UI.includes(imported.folder) && !imported.typeOnly) offenders.push(`${posix(file)} -> ${imported.folder}/ (value import)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
