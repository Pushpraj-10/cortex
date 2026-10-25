import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getImportGraph } from "../../src/graph/get-import-graph.js";
import { clearImportIndexCache, getCachedImportIndex } from "../../src/graph/import-index-cache.js";

describe("getImportGraph", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    clearImportIndexCache();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string, content: string, mtimeOffsetMs = 0): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
    if (mtimeOffsetMs) {
      const when = new Date(Date.now() + mtimeOffsetMs);
      await fs.utimes(full, when, when);
    }
  }

  it("builds the graph of a workspace", async () => {
    await write("src/a.ts", `import { b } from "./b.js";`);
    await write("src/b.ts", `export const b = 1;`);

    const graph = await getImportGraph(tempDir);

    expect(graph.forward.get("src/a.ts")).toEqual(["src/b.ts"]);
    expect(graph.reverse.get("src/b.ts")).toEqual(["src/a.ts"]);
  });

  it("caches the index and reuses unchanged records on the next call", async () => {
    await write("a.ts", `import "./b.js";`);
    await write("b.ts", "");

    await getImportGraph(tempDir);
    const firstRecord = getCachedImportIndex(tempDir)?.get("a.ts");
    await getImportGraph(tempDir);

    expect(getCachedImportIndex(tempDir)?.get("a.ts")).toBe(firstRecord);
  });

  it("sees an edit made between calls", async () => {
    await write("a.ts", `import "./b.js";`);
    await write("b.ts", "");
    await write("c.ts", "");
    expect((await getImportGraph(tempDir)).reverse.get("b.ts")).toEqual(["a.ts"]);

    await write("a.ts", `import "./c.js";`, 60_000);
    const graph = await getImportGraph(tempDir);

    expect(graph.reverse.get("b.ts")).toBeUndefined();
    expect(graph.reverse.get("c.ts")).toEqual(["a.ts"]);
  });

  it("sees a file created and one deleted between calls", async () => {
    await write("a.ts", `import "./b.js";`);
    await getImportGraph(tempDir);

    await write("b.ts", "");
    expect((await getImportGraph(tempDir)).forward.get("a.ts")).toEqual(["b.ts"]);

    await fs.rm(path.join(tempDir, "b.ts"));
    expect((await getImportGraph(tempDir)).forward.get("a.ts")).toEqual([]);
  });

  it("leaves the cache untouched when the scan is aborted", async () => {
    await write("a.ts", "");
    const controller = new AbortController();
    controller.abort();

    await expect(getImportGraph(tempDir, controller.signal)).rejects.toThrow();

    expect(getCachedImportIndex(tempDir)).toBeUndefined();
  });
});
