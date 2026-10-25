/**
 * Enforces the dependency rules between workspace members, so a wrong-way import fails the build
 * instead of slowly tangling the packages. Three things are checked for every member:
 *   1. its source only imports the @cortex packages it is allowed to (the map below),
 *   2. its package.json declares exactly the @cortex packages its source imports (no missing, no unused),
 *   3. its tsconfig references exactly those packages, so `tsc --build` orders them correctly.
 *
 * Direction: core <- providers, tools, context <- policy, extensions <- config <- agent <- cli.
 * Leaves know nothing about the layers above them; `policy` and `config` depend on others only for types.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Workspace member directory -> the @cortex packages (by directory name) it may depend on. */
const ALLOWED: Record<string, string[]> = {
  "packages/core": [],
  "packages/providers": ["core"],
  "packages/tools": ["core"],
  "packages/context": ["core"],
  "packages/policy": ["tools"],
  "packages/extensions": ["tools"],
  "packages/config": ["extensions", "policy"],
  "packages/agent": ["context", "core", "policy", "providers", "tools"],
  "apps/cli": ["agent", "config", "context", "core", "extensions", "policy", "providers", "tools"],
};

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

/** The set of @cortex packages (directory names) a member's src imports. */
function importedPackages(member: string): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(join(ROOT, member, "src"))) {
    for (const match of readFileSync(file, "utf8").matchAll(/from "@cortex\/([\w-]+)(?:\/[^"]*)?"/g)) found.add(match[1]!);
  }
  return found;
}

function declaredDependencies(member: string): Set<string> {
  const manifest = JSON.parse(readFileSync(join(ROOT, member, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return new Set(
    Object.keys(manifest.dependencies ?? {})
      .filter((name) => name.startsWith("@cortex/"))
      .map((name) => name.slice("@cortex/".length)),
  );
}

/** tsconfig files allow comments and trailing commas, so references are read with a pattern rather than JSON.parse. */
function tsconfigReferences(member: string): Set<string> {
  const text = readFileSync(join(ROOT, member, "tsconfig.json"), "utf8");
  return new Set([...text.matchAll(/"path":\s*"[^"]*?([\w-]+)"/g)].map((m) => m[1]!));
}

const sorted = (values: Iterable<string>) => [...values].sort();

describe("workspace architecture", () => {
  it("declares every workspace member in the dependency map", () => {
    const members = ["packages", "apps"].flatMap((group) =>
      readdirSync(join(ROOT, group))
        .filter((name) => statSync(join(ROOT, group, name)).isDirectory())
        .map((name) => `${group}/${name}`),
    );
    expect(sorted(members)).toEqual(sorted(Object.keys(ALLOWED)));
  });

  for (const [member, allowed] of Object.entries(ALLOWED)) {
    describe(member, () => {
      it("imports only the packages it is allowed to depend on", () => {
        const violations = sorted(importedPackages(member)).filter((name) => !allowed.includes(name));
        expect(violations).toEqual([]);
      });

      it("declares in package.json exactly the packages its source imports", () => {
        expect(sorted(declaredDependencies(member))).toEqual(sorted(importedPackages(member)));
      });

      it("references exactly those packages in tsconfig.json", () => {
        expect(sorted(tsconfigReferences(member))).toEqual(sorted(importedPackages(member)));
      });

      it("never reaches into another workspace member by relative path", () => {
        const offenders: string[] = [];
        for (const file of sourceFiles(join(ROOT, member, "src"))) {
          if (/from "(\.\.\/)+(packages|apps)\//.test(readFileSync(file, "utf8"))) offenders.push(relative(ROOT, file).split(sep).join("/"));
        }
        expect(offenders).toEqual([]);
      });
    });
  }
});
