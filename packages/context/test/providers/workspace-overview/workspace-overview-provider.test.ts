import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { workspaceOverviewProvider } from "../../../src/providers/workspace-overview/workspace-overview-provider.js";

describe("workspaceOverviewProvider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("always applies (declares no applies() predicate)", () => {
    expect(workspaceOverviewProvider.applies).toBeUndefined();
  });

  it("contributes one low-relevance fragment so request-specific context outranks it", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "x");

    const result = await workspaceOverviewProvider.gather({ workspaceRoot: tempDir, userMessage: "hi" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({ providerId: "workspace-overview", title: "Workspace Overview", relevance: 0.1 });
      expect(result.value[0]?.content).toContain("a.txt");
    }
  });

  it("returns an error Result when the workspace cannot be read", async () => {
    const result = await workspaceOverviewProvider.gather({ workspaceRoot: path.join(tempDir, "missing"), userMessage: "hi" });
    expect(result.ok).toBe(false);
  });
});
