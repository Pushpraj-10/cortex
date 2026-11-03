import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnsafePathError, WorkspaceBoundaryError, resolveWorkspacePath } from "../src/workspace-path.js";

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

describe("resolveWorkspacePath: names Windows treats specially", () => {
  it.each(["nul", "NUL", "nul.txt", "con", "CON.log", "prn", "aux", "com1", "COM9.txt", "lpt1", "LPT9", "com¹", "src/aux/a.ts", "src\\nul"])(
    "refuses the device name in %s",
    (name) => {
      expect(() => resolveWorkspacePath(root, name)).toThrow(UnsafePathError);
    },
  );

  it.each(["report.txt:stream", "C:foo", "src/a.ts:hidden"])("refuses drive and stream syntax in %s", (name) => {
    expect(() => resolveWorkspacePath(root, name)).toThrow(UnsafePathError);
  });

  it.each(["trailing.", "trailing ", "dir./file.ts", "dir /file.ts"])("refuses a trailing dot or space in %s", (name) => {
    expect(() => resolveWorkspacePath(root, name)).toThrow(UnsafePathError);
  });

  it("accepts names that only resemble them", () => {
    for (const name of ["console.ts", "auxiliary/a.ts", "com10.txt", "lpt.txt", "nullable.ts", "src/./a.ts", ".gitignore", "a.b.c", "my file.txt"]) {
      expect(() => resolveWorkspacePath(root, name), name).not.toThrow();
    }
  });

  it("says which component is the problem and why, with a stable code", () => {
    try {
      resolveWorkspacePath(root, "src/nul.txt");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafePathError);
      expect((error as UnsafePathError).code).toBe("WORKSPACE_PATH_UNSAFE");
      expect((error as UnsafePathError).message).toContain('"nul.txt"');
      expect((error as UnsafePathError).message).toContain("device name");
    }
  });

  it("still reports an escape as an escape, not as an unsafe name", () => {
    expect(() => resolveWorkspacePath(root, "../outside.txt")).toThrow(WorkspaceBoundaryError);
  });
});

describe("resolveWorkspacePath: symbolic links and junctions", () => {
  let base: string;
  let workspace: string;
  let outside: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(process.cwd(), "test-"));
    workspace = path.join(base, "ws");
    outside = path.join(base, "outside");
    fs.mkdirSync(workspace);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "OUTSIDE");
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  /** A directory link (a junction on Windows, which needs no special privilege). */
  const dirLink = (target: string, at: string) => fs.symlinkSync(target, path.join(workspace, at), "junction");

  it("refuses a path that goes through a link out of the workspace, for a file that exists", () => {
    dirLink(outside, "dirlink");
    expect(() => resolveWorkspacePath(workspace, "dirlink/secret.txt")).toThrow(WorkspaceBoundaryError);
  });

  it("refuses the link itself, and a file that does not exist yet beneath it (a write through the link)", () => {
    dirLink(outside, "dirlink");
    expect(() => resolveWorkspacePath(workspace, "dirlink")).toThrow(WorkspaceBoundaryError);
    expect(() => resolveWorkspacePath(workspace, "dirlink/new.txt")).toThrow(WorkspaceBoundaryError);
    expect(() => resolveWorkspacePath(workspace, "dirlink/sub/new.txt")).toThrow(WorkspaceBoundaryError);
  });

  it("explains that a link was the problem, and what to do", () => {
    dirLink(outside, "dirlink");
    try {
      resolveWorkspacePath(workspace, "dirlink/secret.txt");
      expect.unreachable();
    } catch (error) {
      expect((error as WorkspaceBoundaryError).code).toBe("WORKSPACE_PATH_ESCAPE");
      expect((error as WorkspaceBoundaryError).message).toContain("symbolic link or junction");
      expect((error as WorkspaceBoundaryError).message).toContain("real location is inside the workspace");
    }
  });

  it("refuses a link that points at nothing, since writing through it would create the file at its target", (context) => {
    try {
      dirLink(path.join(outside, "not-there"), "dangling");
    } catch {
      return context.skip(); // this system will not make a link to a missing target
    }
    expect(() => resolveWorkspacePath(workspace, "dangling/new.txt")).toThrow(WorkspaceBoundaryError);
  });

  it("refuses a link to a file outside the workspace", (context) => {
    try {
      fs.symlinkSync(path.join(outside, "secret.txt"), path.join(workspace, "filelink.txt"), "file");
    } catch {
      return context.skip(); // creating a file link needs a privilege this system has not granted
    }
    expect(() => resolveWorkspacePath(workspace, "filelink.txt")).toThrow(WorkspaceBoundaryError);
  });

  it("allows a link that stays inside the workspace, and returns the path as asked", () => {
    fs.mkdirSync(path.join(workspace, "real"));
    dirLink(path.join(workspace, "real"), "alias");
    expect(resolveWorkspacePath(workspace, "alias/x.txt")).toBe(path.resolve(workspace, "alias/x.txt"));
  });

  it("allows a new file in an existing directory, and in directories that do not exist yet", () => {
    fs.mkdirSync(path.join(workspace, "src"));
    expect(resolveWorkspacePath(workspace, "src/new.ts")).toBe(path.resolve(workspace, "src/new.ts"));
    expect(resolveWorkspacePath(workspace, "not/yet/there.ts")).toBe(path.resolve(workspace, "not/yet/there.ts"));
  });

  it("allows a workspace that is itself reached through a link", () => {
    const viaLink = path.join(base, "root-link");
    fs.symlinkSync(workspace, viaLink, "junction");
    fs.mkdirSync(path.join(workspace, "src"));
    expect(resolveWorkspacePath(viaLink, "src/a.ts")).toBe(path.resolve(viaLink, "src/a.ts"));
    expect(resolveWorkspacePath(viaLink, ".")).toBe(path.resolve(viaLink));
  });

  it("changes nothing on disk when it refuses", () => {
    dirLink(outside, "dirlink");
    try {
      resolveWorkspacePath(workspace, "dirlink/new.txt");
    } catch {
      /* expected */
    }
    expect(fs.readdirSync(outside)).toEqual(["secret.txt"]);
  });
});
