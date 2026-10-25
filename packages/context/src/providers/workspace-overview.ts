/**
 * Workspace-overview provider: a shallow, low-relevance snapshot of the repository (top-level listing, package.json name and
 * description, README excerpt) attached to every turn and the first thing dropped when the block runs long.
 */
import { CortexError, ok, err, resolveWorkspacePath, type Result } from "@cortex/core";
import { promises as fs } from "node:fs";
import type { ContextProvider } from "../types.js";
import { IGNORED_NAMES } from "../workspace.js";

// ---- Errors ----

export class WorkspaceOverviewProviderError extends CortexError {
  constructor(message: string, cause?: unknown) {
    super(message, "CONTEXT_WORKSPACE_OVERVIEW_ERROR", cause);
  }
}

// ---- Formatting ----

export interface WorkspaceOverviewData {
  entries: { name: string; type: "file" | "directory" }[];
  packageInfo?: { name?: string; description?: string };
  readmeExcerpt?: string;
}

/** Renders workspace overview data into the fragment content string. Pure — no IO. */
export function formatOverview(data: WorkspaceOverviewData): string {
  const sections: string[] = [];

  if (data.packageInfo?.name) {
    const description = data.packageInfo.description ? ` — ${data.packageInfo.description}` : "";
    sections.push(`Project: ${data.packageInfo.name}${description}`);
  }

  if (data.entries.length > 0) {
    const listing = data.entries.map((entry) => `- ${entry.name}${entry.type === "directory" ? "/" : ""}`).join("\n");
    sections.push(`Top-level contents:\n${listing}`);
  }

  if (data.readmeExcerpt) {
    sections.push(`README excerpt:\n${data.readmeExcerpt}`);
  }

  return sections.join("\n\n");
}

// ---- Reading the workspace ----

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
      .filter((entry) => !IGNORED_NAMES.has(entry.name))
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

// ---- The provider ----

/** Contributes a shallow directory listing + package.json name/description + README excerpt. */
export const workspaceOverviewProvider: ContextProvider = {
  id: "workspace-overview",
  async gather(request) {
    const result = await readWorkspaceOverview(request.workspaceRoot);
    if (!result.ok) return result;

    // Low relevance: general background that always applies, so it ranks below anything the
    // request specifically asked for and is the first thing dropped when the block runs long.
    return ok([
      {
        providerId: "workspace-overview",
        title: "Workspace Overview",
        content: formatOverview(result.value),
        relevance: 0.1,
      },
    ]);
  },
};
