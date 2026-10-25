import { promises as fs } from "node:fs";
import { resolveWorkspacePath } from "@cortex/shared";

export interface PackageManifest {
  name: string;
  /** `main`, else `module`, else `types`; relative to the package directory. */
  main?: string;
}

/** The name and entry point from a workspace `package.json`; `undefined` when it's unreadable, malformed or unnamed. */
export async function readPackageManifest(
  workspaceRoot: string,
  relativePath: string,
): Promise<PackageManifest | undefined> {
  try {
    const raw = await fs.readFile(resolveWorkspacePath(workspaceRoot, relativePath), "utf-8");
    const parsed = JSON.parse(raw) as { name?: unknown; main?: unknown; module?: unknown; types?: unknown };
    if (typeof parsed.name !== "string" || parsed.name === "") return undefined;

    const main = [parsed.main, parsed.module, parsed.types].find((value): value is string => typeof value === "string");
    return { name: parsed.name, main };
  } catch {
    return undefined;
  }
}
