import { listImportCandidates } from "../workspace/list-import-candidates.js";
import { packageNameOf } from "./package-name-of.js";

/** A workspace package, found by its `package.json`. */
export interface WorkspacePackage {
  /** Workspace-relative path of the package's `package.json`. */
  manifest: string;
  /** Entry point relative to the package directory (`src/index.ts`), when it declares one. */
  main?: string;
}

/**
 * Lists, in preference order, the workspace files a bare specifier such as `@cortex/shared`
 * or `@cortex/shared/sub` could refer to, given the workspace's packages by name: the
 * package's entry point for the bare name, or the file under the package directory for a
 * subpath. Empty when the specifier isn't one of the workspace's own packages (a third-party
 * dependency or a built-in). Pure — the caller checks which candidate exists.
 */
export function listPackageImportCandidates(
  specifier: string,
  packages: ReadonlyMap<string, WorkspacePackage>,
): string[] {
  const name = packageNameOf(specifier);
  const workspacePackage = name === undefined ? undefined : packages.get(name);
  if (!name || !workspacePackage) return [];

  const subpath = specifier.slice(name.length).replace(/^\//, "");
  if (subpath) return listImportCandidates(workspacePackage.manifest, `./${subpath}`);
  return workspacePackage.main ? listImportCandidates(workspacePackage.manifest, `./${workspacePackage.main}`) : [];
}
