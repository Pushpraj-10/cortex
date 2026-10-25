import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { mapInBatches, clearImportIndexCache, getCachedImportIndex, setCachedImportIndex, type ImportIndex, updateImportIndex, buildImportGraph, getImportGraph, findDependents, type ImportGraph } from "../src/graph.js";

describe("mapInBatches", () => {
  it("returns results in input order", async () => {
    const result = await mapInBatches([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("never runs more than batchSize at once", async () => {
    let running = 0;
    let peak = 0;

    await mapInBatches(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
    });

    expect(peak).toBe(3);
  });

  it("returns an empty array for no items", async () => {
    expect(await mapInBatches([], 4, async (x) => x)).toEqual([]);
  });

  it("stops between batches once the signal aborts", async () => {
    const controller = new AbortController();
    const seen: number[] = [];

    const run = mapInBatches(
      [1, 2, 3, 4],
      2,
      async (n) => {
        seen.push(n);
        controller.abort();
      },
      controller.signal,
    );

    await expect(run).rejects.toThrow();
    expect(seen).toEqual([1, 2]);
  });
});

{
  const indexWith = (file: string): ImportIndex => new Map([[file, { mtimeMs: 1, size: 1, specifiers: [] }]]);

  describe("import index cache", () => {
    afterEach(() => clearImportIndexCache());

    it("returns undefined for a workspace never cached", () => {
      expect(getCachedImportIndex("/never/seen")).toBeUndefined();
    });

    it("returns what was stored for a workspace", () => {
      const index = indexWith("a.ts");
      setCachedImportIndex("/ws/one", index);
      expect(getCachedImportIndex("/ws/one")).toBe(index);
    });

    it("keeps workspaces separate", () => {
      setCachedImportIndex("/ws/one", indexWith("a.ts"));
      expect(getCachedImportIndex("/ws/two")).toBeUndefined();
    });

    it("treats equivalent spellings of the same root as one workspace", () => {
      const index = indexWith("a.ts");
      setCachedImportIndex(path.join("/ws", "one"), index);
      expect(getCachedImportIndex("/ws/one/")).toBe(index);
      expect(getCachedImportIndex("/ws/other/../one")).toBe(index);
    });

    it("clears one workspace", () => {
      setCachedImportIndex("/ws/one", indexWith("a.ts"));
      setCachedImportIndex("/ws/two", indexWith("b.ts"));

      clearImportIndexCache("/ws/one");

      expect(getCachedImportIndex("/ws/one")).toBeUndefined();
      expect(getCachedImportIndex("/ws/two")).toBeDefined();
    });

    it("clears everything when called with no argument", () => {
      setCachedImportIndex("/ws/one", indexWith("a.ts"));
      setCachedImportIndex("/ws/two", indexWith("b.ts"));

      clearImportIndexCache();

      expect(getCachedImportIndex("/ws/one")).toBeUndefined();
      expect(getCachedImportIndex("/ws/two")).toBeUndefined();
    });
  });
}

describe("updateImportIndex", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string, content: string): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  /** Writes new content and forces a distinct mtime so the test doesn't depend on clock resolution. */
  async function rewrite(relativePath: string, content: string): Promise<void> {
    await write(relativePath, content);
    const later = new Date(Date.now() + 60_000);
    await fs.utimes(path.join(tempDir, relativePath), later, later);
  }

  it("indexes source files with their raw import specifiers", async () => {
    await write("src/a.ts", `import { b } from "./b.js";`);
    await write("src/b.ts", `export const b = 1;`);

    const index = await updateImportIndex(tempDir);

    expect([...index.keys()].sort()).toEqual(["src/a.ts", "src/b.ts"]);
    expect(index.get("src/a.ts")?.specifiers).toEqual(["./b.js"]);
    expect(index.get("src/b.ts")?.specifiers).toEqual([]);
  });

  it("ignores non-source files and ignored directories", async () => {
    await write("README.md", "# hi");
    await write("data.json", "{}");
    await write("node_modules/dep/index.js", `import "./x.js";`);
    await write("a.ts", "");

    expect([...(await updateImportIndex(tempDir)).keys()]).toEqual(["a.ts"]);
  });

  it("indexes a package.json by its package name and entry point, with no specifiers", async () => {
    await write("packages/core/package.json", JSON.stringify({ name: "@cortex/core", main: "src/index.ts" }));
    await write("tsconfig.json", "{}");

    const index = await updateImportIndex(tempDir);

    expect(index.get("packages/core/package.json")).toMatchObject({
      packageName: "@cortex/core",
      packageMain: "src/index.ts",
      specifiers: [],
    });
    expect(index.has("tsconfig.json")).toBe(false);
  });

  it("indexes a package.json without a usable name as a plain record", async () => {
    await write("package.json", "{ not json");

    const record = (await updateImportIndex(tempDir)).get("package.json");

    expect(record?.packageName).toBeUndefined();
    expect(record?.specifiers).toEqual([]);
  });

  it("records package imports as specifiers too", async () => {
    await write("a.ts", `import { ok } from "@cortex/core";`);
    expect((await updateImportIndex(tempDir)).get("a.ts")?.specifiers).toEqual(["@cortex/core"]);
  });

  it("reuses the previous record for a file that hasn't changed", async () => {
    await write("a.ts", `import "./b.js";`);
    const first = await updateImportIndex(tempDir);

    const second = await updateImportIndex(tempDir, first);

    expect(second.get("a.ts")).toBe(first.get("a.ts"));
  });

  it("re-parses a file whose mtime changed", async () => {
    await write("a.ts", `import "./b.js";`);
    const first = await updateImportIndex(tempDir);

    await rewrite("a.ts", `import "./c.js";`);
    const second = await updateImportIndex(tempDir, first);

    expect(second.get("a.ts")?.specifiers).toEqual(["./c.js"]);
  });

  it("picks up new files and drops deleted ones", async () => {
    await write("old.ts", "");
    const first = await updateImportIndex(tempDir);

    await fs.rm(path.join(tempDir, "old.ts"));
    await write("new.ts", "");
    const second = await updateImportIndex(tempDir, first);

    expect([...second.keys()]).toEqual(["new.ts"]);
  });

  it("keeps an oversized file in the index but doesn't read its imports", async () => {
    await write("huge.ts", `import "./b.js";\n` + "x".repeat(200));

    const index = await updateImportIndex(tempDir, undefined, { maxFileBytes: 100 });

    expect(index.has("huge.ts")).toBe(true);
    expect(index.get("huge.ts")?.specifiers).toEqual([]);
  });

  it("does not mutate the previous index", async () => {
    await write("a.ts", "");
    const first = await updateImportIndex(tempDir);
    const snapshot = [...first.keys()];

    await write("b.ts", "");
    await updateImportIndex(tempDir, first);

    expect([...first.keys()]).toEqual(snapshot);
  });

  it("rejects when the signal is already aborted", async () => {
    await write("a.ts", "");
    const controller = new AbortController();
    controller.abort();

    await expect(updateImportIndex(tempDir, undefined, { signal: controller.signal })).rejects.toThrow();
  });

  it("returns an empty index for a workspace that doesn't exist", async () => {
    expect((await updateImportIndex(path.join(tempDir, "missing"))).size).toBe(0);
  });
});

{
  function indexOf(files: Record<string, string[]>): ImportIndex {
    return new Map(Object.entries(files).map(([file, specifiers]) => [file, { mtimeMs: 0, size: 0, specifiers }]));
  }

  describe("buildImportGraph", () => {
    it("resolves specifiers (.js for .ts, extensionless, directory index) into forward and reverse edges", () => {
      const graph = buildImportGraph(
        indexOf({
          "src/a.ts": ["./b.js", "./util", "./lib"],
          "src/b.ts": [],
          "src/util.ts": [],
          "src/lib/index.ts": [],
        }),
      );

      expect(graph.forward.get("src/a.ts")).toEqual(["src/b.ts", "src/util.ts", "src/lib/index.ts"]);
      expect(graph.reverse.get("src/b.ts")).toEqual(["src/a.ts"]);
      expect(graph.reverse.get("src/lib/index.ts")).toEqual(["src/a.ts"]);
    });

    it("lists every importer of a shared file", () => {
      const graph = buildImportGraph(indexOf({ "a.ts": ["./c.js"], "b.ts": ["./c.js"], "c.ts": [] }));
      expect(graph.reverse.get("c.ts")).toEqual(["a.ts", "b.ts"]);
    });

    it("drops imports that don't land on an indexed file", () => {
      const graph = buildImportGraph(indexOf({ "a.ts": ["./gone.js", "../outside.js"] }));
      expect(graph.forward.get("a.ts")).toEqual([]);
      expect(graph.reverse.size).toBe(0);
    });

    it("drops self-imports and repeated imports of the same file", () => {
      const graph = buildImportGraph(indexOf({ "a.ts": ["./a.js", "./b.js", "./b"], "b.ts": [] }));
      expect(graph.forward.get("a.ts")).toEqual(["b.ts"]);
    });

    it("reflects the current file set: an import resolves once its target exists", () => {
      const before = buildImportGraph(indexOf({ "a.ts": ["./b.js"] }));
      const after = buildImportGraph(indexOf({ "a.ts": ["./b.js"], "b.ts": [] }));

      expect(before.forward.get("a.ts")).toEqual([]);
      expect(after.forward.get("a.ts")).toEqual(["b.ts"]);
    });

    describe("workspace packages", () => {
      const manifest = (name: string, main?: string) => ({ mtimeMs: 0, size: 0, specifiers: [], packageName: name, packageMain: main });
      const source = (...specifiers: string[]) => ({ mtimeMs: 0, size: 0, specifiers });

      it("resolves a package import to that package's entry point, across package boundaries", () => {
        const graph = buildImportGraph(
          new Map([
            ["packages/core/package.json", manifest("@cortex/core", "src/index.ts")],
            ["packages/core/src/index.ts", source()],
            ["packages/agent/src/loop.ts", source("@cortex/core")],
            ["packages/providers/src/client.ts", source("@cortex/core")],
          ]),
        );

        expect(graph.forward.get("packages/agent/src/loop.ts")).toEqual(["packages/core/src/index.ts"]);
        expect(graph.reverse.get("packages/core/src/index.ts")).toEqual([
          "packages/agent/src/loop.ts",
          "packages/providers/src/client.ts",
        ]);
      });

      it("resolves a subpath import to the file under the package directory", () => {
        const graph = buildImportGraph(
          new Map([
            ["packages/core/package.json", manifest("@cortex/core", "src/index.ts")],
            ["packages/core/utils/ids.ts", source()],
            ["app/main.ts", source("@cortex/core/utils/ids")],
          ]),
        );

        expect(graph.forward.get("app/main.ts")).toEqual(["packages/core/utils/ids.ts"]);
      });

      it("ignores third-party and built-in imports", () => {
        const graph = buildImportGraph(
          new Map([
            ["packages/core/package.json", manifest("@cortex/core", "src/index.ts")],
            ["packages/core/src/index.ts", source()],
            ["a.ts", source("react", "node:fs", "lodash/fp")],
          ]),
        );

        expect(graph.forward.get("a.ts")).toEqual([]);
      });

      it("drops a package import whose entry point doesn't exist", () => {
        const graph = buildImportGraph(
          new Map([
            ["packages/gone/package.json", manifest("@cortex/gone", "src/index.ts")],
            ["a.ts", source("@cortex/gone")],
          ]),
        );

        expect(graph.forward.get("a.ts")).toEqual([]);
      });

      it("lets a change ripple from a leaf package's file out through other packages", () => {
        const graph = buildImportGraph(
          new Map([
            ["packages/core/package.json", manifest("@cortex/core", "src/index.ts")],
            ["packages/core/src/index.ts", source("./result.js")],
            ["packages/core/src/result.ts", source()],
            ["packages/agent/src/loop.ts", source("@cortex/core")],
          ]),
        );

        expect(graph.reverse.get("packages/core/src/result.ts")).toEqual(["packages/core/src/index.ts"]);
        expect(graph.reverse.get("packages/core/src/index.ts")).toEqual(["packages/agent/src/loop.ts"]);
      });
    });

    it("gives every indexed file a forward entry, even with no imports", () => {
      expect(buildImportGraph(indexOf({ "a.ts": [] })).forward.get("a.ts")).toEqual([]);
    });
  });
}

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

{
  /** Builds a graph from `importer -> [imported...]` pairs, filling in the reverse side. */
  function graphOf(edges: Record<string, string[]>): ImportGraph {
    const forward = new Map(Object.entries(edges));
    const reverse = new Map<string, string[]>();
    for (const [importer, targets] of forward) {
      for (const target of targets) reverse.set(target, [...(reverse.get(target) ?? []), importer]);
    }
    return { forward, reverse };
  }

  describe("findDependents", () => {
    it("finds direct importers at depth 1", () => {
      const graph = graphOf({ "a.ts": ["core.ts"], "b.ts": ["core.ts"], "core.ts": [] });
      expect(findDependents(graph, "core.ts")).toEqual([
        { file: "a.ts", depth: 1 },
        { file: "b.ts", depth: 1 },
      ]);
    });

    it("follows importers of importers, nearest first", () => {
      const graph = graphOf({ "app.ts": ["mid.ts"], "mid.ts": ["core.ts"], "core.ts": [] });
      expect(findDependents(graph, "core.ts")).toEqual([
        { file: "mid.ts", depth: 1 },
        { file: "app.ts", depth: 2 },
      ]);
    });

    it("stops at maxDepth", () => {
      const graph = graphOf({ "c.ts": ["b.ts"], "b.ts": ["a.ts"], "a.ts": [] });
      expect(findDependents(graph, "a.ts", { maxDepth: 1 })).toEqual([{ file: "b.ts", depth: 1 }]);
    });

    it("stops at maxResults, keeping the nearest", () => {
      const graph = graphOf({ "far.ts": ["near1.ts"], "near1.ts": ["core.ts"], "near2.ts": ["core.ts"], "core.ts": [] });
      expect(findDependents(graph, "core.ts", { maxResults: 2 })).toEqual([
        { file: "near1.ts", depth: 1 },
        { file: "near2.ts", depth: 1 },
      ]);
    });

    it("reports a file reachable by two routes once, at its shallowest depth", () => {
      const graph = graphOf({ "top.ts": ["left.ts", "core.ts"], "left.ts": ["core.ts"], "core.ts": [] });
      expect(findDependents(graph, "core.ts")).toEqual([
        { file: "left.ts", depth: 1 },
        { file: "top.ts", depth: 1 },
      ]);
    });

    it("terminates on an import cycle and never reports the file itself", () => {
      const graph = graphOf({ "a.ts": ["b.ts"], "b.ts": ["a.ts"] });
      expect(findDependents(graph, "a.ts")).toEqual([{ file: "b.ts", depth: 1 }]);
    });

    it("sorts within a depth so output is stable", () => {
      const graph = graphOf({ "z.ts": ["core.ts"], "a.ts": ["core.ts"], "m.ts": ["core.ts"], "core.ts": [] });
      expect(findDependents(graph, "core.ts").map((d) => d.file)).toEqual(["a.ts", "m.ts", "z.ts"]);
    });

    it("returns [] for a file nothing imports, or one the graph doesn't know", () => {
      const graph = graphOf({ "a.ts": [] });
      expect(findDependents(graph, "a.ts")).toEqual([]);
      expect(findDependents(graph, "unknown.ts")).toEqual([]);
    });
  });
}
