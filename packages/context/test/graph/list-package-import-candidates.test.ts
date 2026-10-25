import { describe, expect, it } from "vitest";
import {
  listPackageImportCandidates,
  type WorkspacePackage,
} from "../../src/graph/list-package-import-candidates.js";

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
