import { listImportCandidates } from "../workspace/list-import-candidates.js";
import { listPackageImportCandidates, type WorkspacePackage } from "./list-package-import-candidates.js";
import type { ImportGraph, ImportIndex } from "./types.js";

/**
 * Resolves every indexed file's import specifiers against the files in the index and
 * returns the edges in both directions. Relative imports resolve by path; bare imports
 * (`@cortex/core`) resolve only if they name one of the workspace's own packages, found via
 * its `package.json`, and land on that package's entry point — which is what lets a change
 * ripple across package boundaries. Resolution is a set lookup per candidate — no IO — so
 * it stays cheap enough to redo on every turn. Imports that don't land on an indexed file
 * (third-party packages, built-ins, missing files) and self-imports are dropped.
 */
export function buildImportGraph(index: ImportIndex): ImportGraph {
  const packages = new Map<string, WorkspacePackage>();
  for (const [file, record] of index) {
    if (record.packageName) packages.set(record.packageName, { manifest: file, main: record.packageMain });
  }

  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();

  for (const [file, record] of index) {
    const targets: string[] = [];

    for (const specifier of record.specifiers) {
      const candidates = specifier.startsWith(".")
        ? listImportCandidates(file, specifier)
        : listPackageImportCandidates(specifier, packages);
      const target = candidates.find((candidate) => index.has(candidate));
      if (target && target !== file && !targets.includes(target)) targets.push(target);
    }

    forward.set(file, targets);
    for (const target of targets) {
      const importers = reverse.get(target);
      if (importers) importers.push(file);
      else reverse.set(target, [file]);
    }
  }

  return { forward, reverse };
}
