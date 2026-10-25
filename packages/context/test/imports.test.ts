import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { extractModuleSpecifiers, extractImports, listImportCandidates, resolveImportPath, isSourceFile, isIndexedFile, packageNameOf, readPackageManifest, listPackageImportCandidates, type WorkspacePackage, readFileSpecifiers } from "../src/imports.js";

describe("extractModuleSpecifiers", () => {
  it("returns relative, package and built-in specifiers alike, in order", () => {
    const source = [
      `import fs from "node:fs";`,
      `import { ok } from "@cortex/core";`,
      `import { b } from "./b.js";`,
      `export { c } from "../c.js";`,
      `const d = require("lodash");`,
      `const e = await import("@scope/pkg/sub");`,
    ].join("\n");

    expect(extractModuleSpecifiers(source)).toEqual([
      "node:fs",
      "@cortex/core",
      "./b.js",
      "../c.js",
      "lodash",
      "@scope/pkg/sub",
    ]);
  });

  it("lists each specifier once", () => {
    expect(extractModuleSpecifiers(`import "a";\nimport { x } from "a";`)).toEqual(["a"]);
  });

  it("returns nothing for a file with no imports", () => {
    expect(extractModuleSpecifiers("export const x = 1;")).toEqual([]);
  });
});

describe("extractImports", () => {
  it("finds default, named, namespace and type imports", () => {
    const source = [
      `import a from "./a.js";`,
      `import { b } from './b.js';`,
      `import * as c from "../c.js";`,
      `import type { D } from "./d.js";`,
    ].join("\n");

    expect(extractImports(source)).toEqual(["./a.js", "./b.js", "../c.js", "./d.js"]);
  });

  it("finds a multi-line import list", () => {
    const source = `import {\n  one,\n  two,\n} from "./many.js";`;
    expect(extractImports(source)).toEqual(["./many.js"]);
  });

  it("finds re-exports, side-effect imports, dynamic imports and require()", () => {
    const source = [
      `export { x } from "./x.js";`,
      `export * from "./y.js";`,
      `import "./polyfill.js";`,
      `const z = await import("./z.js");`,
      `const w = require("./w");`,
    ].join("\n");

    expect(extractImports(source)).toEqual(["./x.js", "./y.js", "./polyfill.js", "./z.js", "./w"]);
  });

  it("ignores package imports", () => {
    const source = `import fs from "node:fs";\nimport { ok } from "@cortex/core";\nimport React from "react";`;
    expect(extractImports(source)).toEqual([]);
  });

  it("does not treat an exported string that says 'from' as an import", () => {
    expect(extractImports(`export const label = "from ./nowhere.js";`)).toEqual([]);
  });

  it("lists each specifier once, in order of first appearance", () => {
    const source = `import { a } from "./a.js";\nimport { b } from "./b.js";\nexport { a2 } from "./a.js";`;
    expect(extractImports(source)).toEqual(["./a.js", "./b.js"]);
  });

  it("returns nothing for a file with no imports", () => {
    expect(extractImports("export const x = 1;")).toEqual([]);
  });
});

describe("listImportCandidates", () => {
  it("tries the TypeScript source files before the .js file as written", () => {
    expect(listImportCandidates("src/core/a.ts", "./b.js")).toEqual(["src/core/b.ts", "src/core/b.tsx", "src/core/b.js"]);
  });

  it("maps .jsx to .tsx and .mjs/.cjs to .mts/.cts", () => {
    expect(listImportCandidates("src/a.ts", "./App.jsx")).toEqual(["src/App.tsx", "src/App.jsx"]);
    expect(listImportCandidates("src/a.ts", "./m.mjs")).toEqual(["src/m.mts", "src/m.mjs"]);
    expect(listImportCandidates("src/a.ts", "./c.cjs")).toEqual(["src/c.cts", "src/c.cjs"]);
  });

  it("offers the path itself, then each extension, then each directory index, for an extensionless import", () => {
    const candidates = listImportCandidates("src/index.ts", "./util");
    expect(candidates[0]).toBe("src/util");
    expect(candidates).toContain("src/util.ts");
    expect(candidates).toContain("src/util/index.ts");
    expect(candidates.indexOf("src/util.ts")).toBeLessThan(candidates.indexOf("src/util/index.ts"));
  });

  it("keeps a .json import as written first", () => {
    expect(listImportCandidates("src/a.ts", "./data.json")[0]).toBe("src/data.json");
  });

  it("normalises parent-directory specifiers", () => {
    expect(listImportCandidates("src/core/a.ts", "../shared.js")[0]).toBe("src/shared.ts");
  });

  it("produces candidates starting with .. when the specifier climbs out of the workspace", () => {
    expect(listImportCandidates("a.ts", "../outside.js").every((c) => c.startsWith(".."))).toBe(true);
  });
});

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

describe("isSourceFile", () => {
  it.each(["a.ts", "src/App.tsx", "b.js", "c.jsx", "d.mjs", "e.cjs", "f.mts", "g.cts"])("accepts %s", (file) => {
    expect(isSourceFile(file)).toBe(true);
  });

  it.each(["README.md", "data.json", "style.css", "script.sh", "Makefile", "a.tsx.bak", "ts"])("rejects %s", (file) => {
    expect(isSourceFile(file)).toBe(false);
  });
});

describe("isIndexedFile", () => {
  it("accepts source files and package.json at any depth", () => {
    expect(isIndexedFile("src/a.ts")).toBe(true);
    expect(isIndexedFile("package.json")).toBe(true);
    expect(isIndexedFile("packages/core/package.json")).toBe(true);
  });

  it("rejects other files, including other JSON", () => {
    expect(isIndexedFile("tsconfig.json")).toBe(false);
    expect(isIndexedFile("package-lock.json")).toBe(false);
    expect(isIndexedFile("README.md")).toBe(false);
  });
});

describe("packageNameOf", () => {
  it.each([
    ["lodash", "lodash"],
    ["lodash/fp", "lodash"],
    ["@cortex/core", "@cortex/core"],
    ["@cortex/core/sub/path", "@cortex/core"],
  ])("maps %s to %s", (specifier, expected) => {
    expect(packageNameOf(specifier)).toBe(expected);
  });

  it.each(["./a.js", "../b", "/abs/path", "node:fs", "@scopeOnly"])("returns undefined for %s", (specifier) => {
    expect(packageNameOf(specifier)).toBeUndefined();
  });
});

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

{
  const packages = new Map<string, WorkspacePackage>([
    ["@cortex/core", { manifest: "packages/core/package.json", main: "src/index.ts" }],
    ["@cortex/bare", { manifest: "packages/bare/package.json" }],
    ["rootpkg", { manifest: "package.json", main: "index.js" }],
  ]);

  describe("listPackageImportCandidates", () => {
    it("points a bare package name at the package's entry point", () => {
      expect(listPackageImportCandidates("@cortex/core", packages)[0]).toBe("packages/core/src/index.ts");
    });

    it("points a subpath at the file under the package directory", () => {
      const candidates = listPackageImportCandidates("@cortex/core/utils/ids", packages);
      expect(candidates[0]).toBe("packages/core/utils/ids");
      expect(candidates).toContain("packages/core/utils/ids.ts");
    });

    it("handles a package whose manifest sits at the workspace root", () => {
      expect(listPackageImportCandidates("rootpkg", packages)[0]).toBe("index.ts");
    });

    it("returns nothing for a package that declares no entry point", () => {
      expect(listPackageImportCandidates("@cortex/bare", packages)).toEqual([]);
    });

    it("returns nothing for third-party packages, built-ins and relative specifiers", () => {
      expect(listPackageImportCandidates("react", packages)).toEqual([]);
      expect(listPackageImportCandidates("node:fs", packages)).toEqual([]);
      expect(listPackageImportCandidates("./a.js", packages)).toEqual([]);
    });
  });
}

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
      `import { b } from "./b.js";\nimport { ok } from "@cortex/core";\nimport fs from "node:fs";\n`,
    );
    expect(await readFileSpecifiers(tempDir, "a.ts")).toEqual(["./b.js", "@cortex/core", "node:fs"]);
  });

  it("returns [] for a missing file instead of throwing", async () => {
    expect(await readFileSpecifiers(tempDir, "missing.ts")).toEqual([]);
  });

  it("returns [] for a path outside the workspace", async () => {
    expect(await readFileSpecifiers(tempDir, "../x.ts")).toEqual([]);
  });
});
