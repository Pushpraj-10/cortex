import { describe, expect, it } from "vitest";
import { findDependents } from "../../src/graph/find-dependents.js";
import type { ImportGraph } from "../../src/graph/types.js";

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
