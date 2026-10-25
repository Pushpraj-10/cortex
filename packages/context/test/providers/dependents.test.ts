import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { clearImportIndexCache } from "../../src/graph.js";
import { formatDependents, dependentsProvider } from "../../src/providers/dependents.js";

describe("formatDependents", () => {
  it("lists direct importers, then each further hop, nearest first", () => {
    const result = formatDependents([
      {
        file: "core.ts",
        dependents: [
          { file: "a.ts", depth: 1 },
          { file: "b.ts", depth: 1 },
          { file: "app.ts", depth: 2 },
          { file: "main.ts", depth: 3 },
        ],
        truncated: false,
      },
    ]);

    expect(result).toBe(
      "core.ts\n  imported by: a.ts, b.ts\n  affected via 2 hops: app.ts\n  affected via 3 hops: main.ts",
    );
  });

  it("notes when the list was capped", () => {
    const result = formatDependents([{ file: "core.ts", dependents: [{ file: "a.ts", depth: 1 }], truncated: true }]);
    expect(result).toBe("core.ts\n  imported by: a.ts\n  (list capped; more files depend on this)");
  });

  it("skips a hop level that has no files", () => {
    const result = formatDependents([{ file: "core.ts", dependents: [{ file: "far.ts", depth: 3 }], truncated: false }]);
    expect(result).toBe("core.ts\n  affected via 3 hops: far.ts");
  });

  it("leaves out files nothing depends on", () => {
    const result = formatDependents([
      { file: "leaf.ts", dependents: [], truncated: false },
      { file: "core.ts", dependents: [{ file: "a.ts", depth: 1 }], truncated: false },
    ]);
    expect(result).toBe("core.ts\n  imported by: a.ts");
  });

  it("separates files with a blank line", () => {
    const result = formatDependents([
      { file: "x.ts", dependents: [{ file: "a.ts", depth: 1 }], truncated: false },
      { file: "y.ts", dependents: [{ file: "b.ts", depth: 1 }], truncated: false },
    ]);
    expect(result).toBe("x.ts\n  imported by: a.ts\n\ny.ts\n  imported by: b.ts");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(formatDependents([])).toBe("");
    expect(formatDependents([{ file: "a.ts", dependents: [], truncated: false }])).toBe("");
  });
});

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
