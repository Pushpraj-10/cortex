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
