import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_TRUSTED_PROJECTS, fingerprintRequests, isProjectTrusted, projectKey, trustPath, trustProject } from "../src/trust.js";

describe("fingerprintRequests", () => {
  it("is the same for the same content however the keys are ordered", () => {
    const a = { hooks: [{ event: "Stop", command: "echo" }], allow: ["x"], mcpServers: { a: { command: "c", args: ["1"] } } };
    const b = { mcpServers: { a: { args: ["1"], command: "c" } }, allow: ["x"], hooks: [{ command: "echo", event: "Stop" }] };
    expect(fingerprintRequests(a)).toBe(fingerprintRequests(b));
  });

  it("changes when anything changes: a command, a rule, an argument, the order of a list", () => {
    const base = { hooks: [{ event: "Stop", command: "echo" }], allow: ["a", "b"], mcpServers: {} };
    const seen = new Set([fingerprintRequests(base)]);
    for (const changed of [
      { ...base, hooks: [{ event: "Stop", command: "echo!" }] },
      { ...base, hooks: [{ event: "Stop", command: "echo", matcher: "x" }] },
      { ...base, allow: ["a", "b", "c"] },
      { ...base, allow: ["b", "a"] },
      { ...base, mcpServers: { s: { command: "node" } } },
      { ...base, defaultMode: "bypassPermissions" },
    ]) {
      seen.add(fingerprintRequests(changed));
    }
    expect(seen.size).toBe(7);
  });

  it("ignores a key that is undefined, as JSON does", () => {
    expect(fingerprintRequests({ allow: [], defaultMode: undefined })).toBe(fingerprintRequests({ allow: [] }));
  });

  it("is a 64-character hex string", () => {
    expect(fingerprintRequests({})).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("the trust store", () => {
  let root: string;
  let home: string;
  let project: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    home = path.join(root, "home");
    project = path.join(root, "project");
    await fs.mkdir(home);
    await fs.mkdir(project);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("trusts nothing at first", async () => {
    expect(await isProjectTrusted(project, "abc", home)).toBe(false);
  });

  it("remembers a project for exactly the requests it was trusted with", async () => {
    await trustProject(project, "abc", home);
    expect(await isProjectTrusted(project, "abc", home)).toBe(true);
    expect(await isProjectTrusted(project, "abd", home)).toBe(false); // the settings changed
    expect(await isProjectTrusted(path.join(root, "other"), "abc", home)).toBe(false); // another project
  });

  it("keeps other projects' answers when a new one is added, and replaces a project's own", async () => {
    const other = path.join(root, "other");
    await fs.mkdir(other);
    await trustProject(project, "one", home);
    await trustProject(other, "two", home);
    await trustProject(project, "three", home);

    expect(await isProjectTrusted(other, "two", home)).toBe(true);
    expect(await isProjectTrusted(project, "three", home)).toBe(true);
    expect(await isProjectTrusted(project, "one", home)).toBe(false);
  });

  it("treats a project reached by another spelling or through a link as the same project", async () => {
    await trustProject(project, "abc", home);
    expect(await isProjectTrusted(path.join(project, "."), "abc", home)).toBe(true);
    expect(await isProjectTrusted(path.join(project, "..", "project"), "abc", home)).toBe(true);

    const link = path.join(root, "link");
    await fs.symlink(project, link, "junction");
    expect(projectKey(link)).toBe(projectKey(project));
    expect(await isProjectTrusted(link, "abc", home)).toBe(true);
  });

  it("treats a folder that does not exist as the project it is named", () => {
    expect(projectKey(path.join(root, "not-there"))).toBe(projectKey(path.join(root, "not-there", ".")));
  });

  it("stores a record per project with the fingerprint and a date, and nothing else", async () => {
    await trustProject(project, "abc", home);
    const stored = JSON.parse(await fs.readFile(trustPath(home), "utf-8")) as { projects: Record<string, { fingerprint: string; trustedAt: string }> };
    const records = Object.values(stored.projects);
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0]!).sort()).toEqual(["fingerprint", "trustedAt"]);
    expect(records[0]!.fingerprint).toBe("abc");
    expect(Number.isNaN(Date.parse(records[0]!.trustedAt))).toBe(false);
  });

  it("is readable by its owner only, where the system has such permissions", async () => {
    if (process.platform === "win32") return; // Windows relies on the profile folder's access rules instead
    await trustProject(project, "abc", home);
    expect((await fs.stat(trustPath(home))).mode & 0o777).toBe(0o600);
    expect((await fs.stat(path.dirname(trustPath(home)))).mode & 0o777).toBe(0o700);
  });

  it("leaves no temporary file behind", async () => {
    await trustProject(project, "abc", home);
    await trustProject(project, "def", home);
    expect(await fs.readdir(path.join(home, ".cortex"))).toEqual(["trust.json"]);
  });

  it("removes its temporary file and reports the error when it cannot save", async () => {
    await fs.mkdir(trustPath(home), { recursive: true }); // a folder where the file should go: the rename cannot succeed
    await expect(trustProject(project, "abc", home)).rejects.toThrow();
    expect((await fs.readdir(path.join(home, ".cortex"))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("trusts nothing when the file is malformed, rather than failing to start, and a new answer repairs it", async () => {
    await fs.mkdir(path.join(home, ".cortex"));
    for (const broken of ["{ not json", "[]", "null", '{"projects": 5}', '{"projects": {"x": 7}}', '{"projects": {"x": {"fingerprint": 1}}}']) {
      await fs.writeFile(trustPath(home), broken);
      expect(await isProjectTrusted(project, "abc", home), broken).toBe(false);
    }
    await trustProject(project, "abc", home);
    expect(await isProjectTrusted(project, "abc", home)).toBe(true);
  });

  it("ignores a record with no usable fingerprint, but keeps the good ones next to it", async () => {
    await trustProject(project, "abc", home);
    const stored = JSON.parse(await fs.readFile(trustPath(home), "utf-8")) as { projects: Record<string, unknown> };
    stored.projects["junk"] = { fingerprint: 42 };
    await fs.writeFile(trustPath(home), JSON.stringify(stored));
    expect(await isProjectTrusted(project, "abc", home)).toBe(true);
  });

  it("forgets the oldest answers past the limit, so the file cannot grow without bound", async () => {
    const stored: Record<string, { fingerprint: string; trustedAt: string }> = {};
    for (let index = 0; index < MAX_TRUSTED_PROJECTS; index += 1) {
      stored[`/old/${index}`] = { fingerprint: "f", trustedAt: new Date(2020, 0, 1, 0, 0, index).toISOString() };
    }
    await fs.mkdir(path.join(home, ".cortex"));
    await fs.writeFile(trustPath(home), JSON.stringify({ projects: stored }));

    await trustProject(project, "new", home);

    const after = JSON.parse(await fs.readFile(trustPath(home), "utf-8")) as { projects: Record<string, unknown> };
    expect(Object.keys(after.projects)).toHaveLength(MAX_TRUSTED_PROJECTS);
    expect(after.projects["/old/0"]).toBeUndefined(); // the oldest went
    expect(after.projects["/old/1"]).toBeDefined();
    expect(await isProjectTrusted(project, "new", home)).toBe(true);
  });
});
