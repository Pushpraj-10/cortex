import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { updateImportIndex } from "../../src/graph/update-import-index.js";

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
