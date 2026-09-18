import { promises as fs } from "node:fs";
import { ok, err, resolveWorkspacePath, type Result } from "@cortex/shared";
import { WorkspaceOverviewProviderError } from "./errors.js";
import type { WorkspaceOverviewData } from "./format-overview.js";

const DENYLIST = new Set(["node_modules", ".git", "dist"]);
const README_EXCERPT_MAX_LENGTH = 500;

/**
 * Reads a shallow snapshot of the workspace: top-level directory listing,
 * package.json name/description, and a README excerpt — each independently
 * best-effort, since a missing package.json or README is normal, not a failure.
 * Only a directory listing failure (e.g. workspaceRoot doesn't exist) fails the whole
 * call, since without it there's nothing meaningful left to report.
 */
export async function readWorkspaceOverview(workspaceRoot: string): Promise<Result<WorkspaceOverviewData>> {
  let entries: WorkspaceOverviewData["entries"];
  try {
    const dirEntries = await fs.readdir(resolveWorkspacePath(workspaceRoot, "."), { withFileTypes: true });
    entries = dirEntries
      .filter((entry) => !DENYLIST.has(entry.name))
      .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? ("directory" as const) : ("file" as const) }));
  } catch (error) {
    return err(new WorkspaceOverviewProviderError(`Failed to read workspace directory at ${workspaceRoot}`, error));
  }

  const packageInfo = await readPackageInfo(workspaceRoot);
  const readmeExcerpt = await readReadmeExcerpt(workspaceRoot);

  return ok({ entries, packageInfo, readmeExcerpt });
}

async function readPackageInfo(workspaceRoot: string): Promise<WorkspaceOverviewData["packageInfo"]> {
  try {
    const raw = await fs.readFile(resolveWorkspacePath(workspaceRoot, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { name?: string; description?: string };
    return { name: parsed.name, description: parsed.description };
  } catch {
    return undefined;
  }
}

async function readReadmeExcerpt(workspaceRoot: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(resolveWorkspacePath(workspaceRoot, "README.md"), "utf-8");
    return raw.trim().slice(0, README_EXCERPT_MAX_LENGTH);
  } catch {
    return undefined;
  }
}
