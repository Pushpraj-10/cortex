import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listWorkspaceFiles } from "../../src/runtime/workspace-files.js";

let root: string;

function touch(relativePath: string) {
  const full = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, "x");
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "cortex-files-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("listWorkspaceFiles", () => {
  it("lists files as /-separated paths relative to the workspace", async () => {
    touch("a.ts");
    touch("src/ui/b.tsx");
    expect((await listWorkspaceFiles(root)).sort()).toEqual(["a.ts", "src/ui/b.tsx"]);
  });

  it("leaves out node_modules, .git and dist", async () => {
    touch("keep.ts");
    touch("node_modules/dep/index.js");
    touch(".git/HEAD");
    touch("dist/bundle.js");
    touch("src/dist/nested.js");
    expect(await listWorkspaceFiles(root)).toEqual(["keep.ts"]);
  });

  it("goes eight folders deep and no further", async () => {
    touch("d1/d2/d3/d4/d5/d6/d7/d8/deep.ts");
    touch("d1/d2/d3/d4/d5/d6/d7/d8/d9/too-deep.ts");
    const found = await listWorkspaceFiles(root);
    expect(found).toContain("d1/d2/d3/d4/d5/d6/d7/d8/deep.ts");
    expect(found.some((file) => file.endsWith("too-deep.ts"))).toBe(false);
  });

  it("is empty for a folder that does not exist, rather than failing", async () => {
    expect(await listWorkspaceFiles(path.join(root, "missing"))).toEqual([]);
  });
});
