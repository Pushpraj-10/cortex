import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveImportPath } from "../../src/workspace/resolve-import-path.js";

describe("resolveImportPath", () => {
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

  it("maps a .js specifier to the .ts source file", async () => {
    await write("src/core/b.ts");
    expect(await resolveImportPath(tempDir, "src/core/a.ts", "./b.js")).toBe("src/core/b.ts");
  });

  it("maps a .js specifier to .tsx when only that exists", async () => {
    await write("src/App.tsx");
    expect(await resolveImportPath(tempDir, "src/index.ts", "./App.js")).toBe("src/App.tsx");
  });

  it("falls back to the file as written when no TypeScript source exists", async () => {
    await write("src/legacy.js");
    expect(await resolveImportPath(tempDir, "src/index.ts", "./legacy.js")).toBe("src/legacy.js");
  });

  it("resolves an extensionless specifier", async () => {
    await write("src/util.ts");
    expect(await resolveImportPath(tempDir, "src/index.ts", "./util")).toBe("src/util.ts");
  });

  it("resolves a directory to its index file", async () => {
    await write("src/lib/index.ts");
    expect(await resolveImportPath(tempDir, "src/index.ts", "./lib")).toBe("src/lib/index.ts");
  });

  it("resolves a parent-directory specifier", async () => {
    await write("src/shared.ts");
    expect(await resolveImportPath(tempDir, "src/core/a.ts", "../shared.js")).toBe("src/shared.ts");
  });

  it("resolves a .json import as written", async () => {
    await write("src/data.json");
    expect(await resolveImportPath(tempDir, "src/index.ts", "./data.json")).toBe("src/data.json");
  });

  it("returns undefined for a file that does not exist", async () => {
    expect(await resolveImportPath(tempDir, "src/a.ts", "./missing.js")).toBeUndefined();
  });

  it("returns undefined for a specifier that escapes the workspace", async () => {
    expect(await resolveImportPath(tempDir, "a.ts", "../outside.js")).toBeUndefined();
  });
});
