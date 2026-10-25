import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceBoundaryError, resolveWorkspacePath } from "../src/workspace-path.js";

const root = path.resolve("sandbox-root", "project");

describe("resolveWorkspacePath", () => {
  it("resolves a relative path inside the root", () => {
    expect(resolveWorkspacePath(root, "src/a.ts")).toBe(path.resolve(root, "src/a.ts"));
  });

  it("resolves '.' to the root itself", () => {
    expect(resolveWorkspacePath(root, ".")).toBe(root);
  });

  it("allows '..' segments that stay inside the root", () => {
    expect(resolveWorkspacePath(root, "src/../lib/b.ts")).toBe(path.resolve(root, "lib/b.ts"));
  });

  it("rejects a path that climbs out of the root", () => {
    expect(() => resolveWorkspacePath(root, "../outside.txt")).toThrow(WorkspaceBoundaryError);
    expect(() => resolveWorkspacePath(root, "src/../../outside.txt")).toThrow(WorkspaceBoundaryError);
    expect(() => resolveWorkspacePath(root, "..")).toThrow(WorkspaceBoundaryError);
  });

  it("rejects a sibling directory that merely shares the root's name as a prefix", () => {
    expect(() => resolveWorkspacePath(root, "../project-evil/secret.txt")).toThrow(WorkspaceBoundaryError);
  });

  it("rejects absolute paths, even ones that point inside the root", () => {
    expect(() => resolveWorkspacePath(root, path.resolve(root, "src/a.ts"))).toThrow(WorkspaceBoundaryError);
    expect(() => resolveWorkspacePath(root, path.resolve("elsewhere"))).toThrow(WorkspaceBoundaryError);
  });

  it("rejects a leading slash or backslash on any platform", () => {
    expect(() => resolveWorkspacePath(root, "/etc/passwd")).toThrow(WorkspaceBoundaryError);
    expect(() => resolveWorkspacePath(root, "\\windows\\system32")).toThrow(WorkspaceBoundaryError);
  });

  it("explains the rule in the error, with a stable code", () => {
    try {
      resolveWorkspacePath(root, "../x");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceBoundaryError);
      expect((error as WorkspaceBoundaryError).code).toBe("WORKSPACE_PATH_ESCAPE");
      expect((error as WorkspaceBoundaryError).message).toContain('"../x"');
      expect((error as WorkspaceBoundaryError).message).toContain("relative");
    }
  });
});
