import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dependentsProvider } from "../../../src/providers/dependents/dependents-provider.js";
import { clearImportIndexCache } from "../../../src/graph/import-index-cache.js";

describe("dependentsProvider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    clearImportIndexCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string, content = ""): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  const request = (userMessage: string) => ({ workspaceRoot: tempDir, userMessage });

  it("applies only when the message names a source file", async () => {
    expect(await dependentsProvider.applies?.(request("refactor src/core.ts"))).toBe(true);
    expect(await dependentsProvider.applies?.(request("update README.md"))).toBe(false);
    expect(await dependentsProvider.applies?.(request("hello there"))).toBe(false);
  });

  it("reports who imports the named file, directly and further out, as one low-relevance fragment", async () => {
    await write("src/core.ts", "export const core = 1;");
    await write("src/mid.ts", `import { core } from "./core.js";`);
    await write("src/app.ts", `import "./mid.js";`);

    const result = await dependentsProvider.gather(request("rename things in src/core.ts"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          providerId: "dependents",
          title: "Files that depend on these",
          content: "src/core.ts\n  imported by: src/mid.ts\n  affected via 2 hops: src/app.ts",
          relevance: 0.4,
        },
      ]);
    }
  });

  it("follows package imports across the workspace's packages", async () => {
    await write("packages/core/package.json", JSON.stringify({ name: "@cortex/core", main: "src/index.ts" }));
    await write("packages/core/src/index.ts", `export * from "./result.js";`);
    await write("packages/core/src/result.ts", "export const ok = 1;");
    await write("packages/agent/package.json", JSON.stringify({ name: "@cortex/agent", main: "src/index.ts" }));
    await write("packages/agent/src/loop.ts", `import { ok } from "@cortex/core";`);

    const result = await dependentsProvider.gather(request("change packages/core/src/result.ts"));

    expect(result.ok && result.value[0]?.content).toBe(
      "packages/core/src/result.ts\n  imported by: packages/core/src/index.ts\n  affected via 2 hops: packages/agent/src/loop.ts",
    );
  });

  it("returns no fragments when nothing imports the named file", async () => {
    await write("lonely.ts");
    const result = await dependentsProvider.gather(request("change lonely.ts"));
    expect(result.ok && result.value).toEqual([]);
  });

  it("returns no fragments, without scanning the workspace, when only non-source files are named", async () => {
    await write("README.md", "# hi");
    await write("a.ts", "");

    const result = await dependentsProvider.gather(request("update README.md"));

    expect(result.ok && result.value).toEqual([]);
  });

  it("returns no fragments when the named file does not exist", async () => {
    const result = await dependentsProvider.gather(request("change nope.ts"));
    expect(result.ok && result.value).toEqual([]);
  });

  it("sees a new importer on the next call without any manual refresh", async () => {
    await write("core.ts");
    const before = await dependentsProvider.gather(request("change core.ts"));
    expect(before.ok && before.value).toEqual([]);

    await write("consumer.ts", `import "./core.js";`);
    const after = await dependentsProvider.gather(request("change core.ts"));

    expect(after.ok && after.value[0]?.content).toBe("core.ts\n  imported by: consumer.ts");
  });
});
