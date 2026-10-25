import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { findRelatedTests } from "../../src/workspace/find-related-tests.js";

describe("findRelatedTests", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "x");
  }

  it("finds a sibling .test file", async () => {
    await write("src/a.ts");
    await write("src/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/a.test.ts"]);
  });

  it("finds a sibling .spec file", async () => {
    await write("src/a.ts");
    await write("src/a.spec.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/a.spec.ts"]);
  });

  it("finds a test in a sibling __tests__ directory", async () => {
    await write("src/a.ts");
    await write("src/__tests__/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/__tests__/a.test.ts"]);
  });

  it("finds a test in a package-level test/ tree that mirrors src/", async () => {
    await write("packages/agent/src/core/tool-loop.ts");
    await write("packages/agent/test/core/tool-loop.test.ts");
    expect(await findRelatedTests(tempDir, "packages/agent/src/core/tool-loop.ts")).toEqual([
      "packages/agent/test/core/tool-loop.test.ts",
    ]);
  });

  it("finds a mirrored test when src/ is at the workspace root", async () => {
    await write("src/core/a.ts");
    await write("test/core/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/core/a.ts")).toEqual(["test/core/a.test.ts"]);
  });

  it("finds a test in a tests/ tree", async () => {
    await write("src/a.ts");
    await write("tests/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["tests/a.test.ts"]);
  });

  it("returns every match when there are several", async () => {
    await write("src/a.ts");
    await write("src/a.test.ts");
    await write("test/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual(["src/a.test.ts", "test/a.test.ts"]);
  });

  it("returns nothing when the file has no tests", async () => {
    await write("src/a.ts");
    expect(await findRelatedTests(tempDir, "src/a.ts")).toEqual([]);
  });

  it("returns nothing for a file that is itself a test", async () => {
    await write("src/a.test.ts");
    expect(await findRelatedTests(tempDir, "src/a.test.ts")).toEqual([]);
  });
});
