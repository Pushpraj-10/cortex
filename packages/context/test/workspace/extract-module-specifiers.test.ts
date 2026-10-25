import { describe, expect, it } from "vitest";
import { extractModuleSpecifiers } from "../../src/workspace/extract-module-specifiers.js";

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
