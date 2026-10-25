import { describe, expect, it } from "vitest";
import { listImportCandidates } from "../../src/workspace/list-import-candidates.js";

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
