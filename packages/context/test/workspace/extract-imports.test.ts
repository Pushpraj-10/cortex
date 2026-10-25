import { describe, expect, it } from "vitest";
import { extractImports } from "../../src/workspace/extract-imports.js";

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
