import { describe, expect, it } from "vitest";
import { buildImportGraph } from "../../src/graph/build-import-graph.js";
import type { ImportIndex } from "../../src/graph/types.js";

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
          ["packages/shared/package.json", manifest("@cortex/shared", "src/index.ts")],
          ["packages/shared/src/index.ts", source()],
          ["packages/agent/src/loop.ts", source("@cortex/shared")],
          ["packages/llm/src/client.ts", source("@cortex/shared")],
        ]),
      );

      expect(graph.forward.get("packages/agent/src/loop.ts")).toEqual(["packages/shared/src/index.ts"]);
      expect(graph.reverse.get("packages/shared/src/index.ts")).toEqual([
        "packages/agent/src/loop.ts",
        "packages/llm/src/client.ts",
      ]);
    });

    it("resolves a subpath import to the file under the package directory", () => {
      const graph = buildImportGraph(
        new Map([
          ["packages/shared/package.json", manifest("@cortex/shared", "src/index.ts")],
          ["packages/shared/utils/ids.ts", source()],
          ["app/main.ts", source("@cortex/shared/utils/ids")],
        ]),
      );

      expect(graph.forward.get("app/main.ts")).toEqual(["packages/shared/utils/ids.ts"]);
    });

    it("ignores third-party and built-in imports", () => {
      const graph = buildImportGraph(
        new Map([
          ["packages/shared/package.json", manifest("@cortex/shared", "src/index.ts")],
          ["packages/shared/src/index.ts", source()],
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
          ["packages/shared/package.json", manifest("@cortex/shared", "src/index.ts")],
          ["packages/shared/src/index.ts", source("./result.js")],
          ["packages/shared/src/result.ts", source()],
          ["packages/agent/src/loop.ts", source("@cortex/shared")],
        ]),
      );

      expect(graph.reverse.get("packages/shared/src/result.ts")).toEqual(["packages/shared/src/index.ts"]);
      expect(graph.reverse.get("packages/shared/src/index.ts")).toEqual(["packages/agent/src/loop.ts"]);
    });
  });

  it("gives every indexed file a forward entry, even with no imports", () => {
    expect(buildImportGraph(indexOf({ "a.ts": [] })).forward.get("a.ts")).toEqual([]);
  });
});
