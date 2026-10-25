import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileSpecifiers } from "../../src/graph/read-file-specifiers.js";

describe("readFileSpecifiers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns every module specifier in a file, package imports included", async () => {
    await fs.writeFile(
      path.join(tempDir, "a.ts"),
      `import { b } from "./b.js";\nimport { ok } from "@cortex/shared";\nimport fs from "node:fs";\n`,
    );
    expect(await readFileSpecifiers(tempDir, "a.ts")).toEqual(["./b.js", "@cortex/shared", "node:fs"]);
  });

  it("returns [] for a missing file instead of throwing", async () => {
    expect(await readFileSpecifiers(tempDir, "missing.ts")).toEqual([]);
  });

  it("returns [] for a path outside the workspace", async () => {
    expect(await readFileSpecifiers(tempDir, "../x.ts")).toEqual([]);
  });
});
