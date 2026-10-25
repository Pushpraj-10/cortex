import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readPackageManifest } from "../../src/graph/read-package-manifest.js";

describe("readPackageManifest", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const write = (content: string) => fs.writeFile(path.join(tempDir, "package.json"), content);

  it("reads the name and main", async () => {
    await write(JSON.stringify({ name: "@cortex/core", main: "src/index.ts" }));
    expect(await readPackageManifest(tempDir, "package.json")).toEqual({ name: "@cortex/core", main: "src/index.ts" });
  });

  it("falls back to module, then types, when there is no main", async () => {
    await write(JSON.stringify({ name: "a", module: "esm.js", types: "a.d.ts" }));
    expect((await readPackageManifest(tempDir, "package.json"))?.main).toBe("esm.js");

    await write(JSON.stringify({ name: "a", types: "a.d.ts" }));
    expect((await readPackageManifest(tempDir, "package.json"))?.main).toBe("a.d.ts");
  });

  it("returns a manifest with no main when none is declared", async () => {
    await write(JSON.stringify({ name: "a" }));
    expect(await readPackageManifest(tempDir, "package.json")).toEqual({ name: "a", main: undefined });
  });

  it("returns undefined when there is no name", async () => {
    await write(JSON.stringify({ main: "x.js" }));
    expect(await readPackageManifest(tempDir, "package.json")).toBeUndefined();
  });

  it("returns undefined for malformed JSON or a missing file", async () => {
    await write("{ not json");
    expect(await readPackageManifest(tempDir, "package.json")).toBeUndefined();
    expect(await readPackageManifest(tempDir, "missing/package.json")).toBeUndefined();
  });
});
