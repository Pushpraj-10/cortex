import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasProjectRequests, loadSettings, mergeSettings, projectRequests, readSettingsLayers } from "../src/settings.js";

describe("loadSettings", () => {
  let root: string;
  let home: string;
  let cwd: string;

  const writeSettings = async (base: string, content: unknown) => {
    await fs.mkdir(path.join(base, ".cortex"), { recursive: true });
    await fs.writeFile(path.join(base, ".cortex", "settings.json"), typeof content === "string" ? content : JSON.stringify(content));
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    home = path.join(root, "home");
    cwd = path.join(root, "project");
    await fs.mkdir(home);
    await fs.mkdir(cwd);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns empty settings when no file exists", async () => {
    expect(await loadSettings(cwd, home)).toEqual({ permissions: { allow: [], deny: [] }, hooks: [], mcpServers: {} });
  });

  it("accumulates permission rules and hooks from user then project", async () => {
    await writeSettings(home, {
      permissions: { allow: ["read_file"], deny: ["run_command(rm:*)"] },
      hooks: [{ event: "Stop", command: "echo user" }],
    });
    await writeSettings(cwd, {
      permissions: { allow: ["run_command(npm test:*)"] },
      hooks: [{ event: "Stop", command: "echo project" }],
    });

    const settings = await loadSettings(cwd, home);
    expect(settings.permissions.allow).toEqual(["read_file", "run_command(npm test:*)"]);
    expect(settings.permissions.deny).toEqual(["run_command(rm:*)"]);
    expect(settings.hooks.map((h) => h.command)).toEqual(["echo user", "echo project"]);
  });

  it("lets the project override the default mode and an MCP server of the same name", async () => {
    await writeSettings(home, {
      permissions: { defaultMode: "plan" },
      mcpServers: { files: { command: "user-cmd" }, other: { command: "other-cmd" } },
    });
    await writeSettings(cwd, { permissions: { defaultMode: "acceptEdits" }, mcpServers: { files: { command: "project-cmd" } } });

    const settings = await loadSettings(cwd, home);
    expect(settings.permissions.defaultMode).toBe("acceptEdits");
    expect(settings.mcpServers).toEqual({ files: { command: "project-cmd" }, other: { command: "other-cmd" } });
  });

  it("fails loudly, naming the file, when the JSON is malformed", async () => {
    await writeSettings(cwd, "{ not json");
    await expect(loadSettings(cwd, home)).rejects.toThrow(/Invalid settings file .*settings\.json/);
  });

  it("fails when permissions.defaultMode is not a permission mode", async () => {
    await writeSettings(cwd, { permissions: { defaultMode: "yolo" } });
    await expect(loadSettings(cwd, home)).rejects.toThrow(/defaultMode "yolo"/);
  });
});

describe("settings: shape checks", () => {
  let root: string;
  let cwd: string;
  let home: string;

  const writeProject = async (content: unknown) => {
    await fs.mkdir(path.join(cwd, ".cortex"), { recursive: true });
    await fs.writeFile(path.join(cwd, ".cortex", "settings.json"), typeof content === "string" ? content : JSON.stringify(content));
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    home = path.join(root, "home");
    cwd = path.join(root, "project");
    await fs.mkdir(home);
    await fs.mkdir(cwd);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it.each([
    ["a list instead of an object", "[]", /must be a JSON object/],
    ["null", "null", /must be a JSON object/],
    ["permissions that is not an object", { permissions: "all" }, /permissions must be an object/],
    ["allow that is not a list of strings", { permissions: { allow: "run_command" } }, /permissions\.allow must be a list of rule strings/],
    ["deny with a number in it", { permissions: { deny: ["a", 3] } }, /permissions\.deny must be a list of rule strings/],
    ["hooks that is not a list", { hooks: "echo" }, /hooks must be a list/],
    ["a hook with an unknown event", { hooks: [{ event: "OnSave", command: "echo" }] }, /hooks\[0\]\.event must be one of/],
    ["a hook with no command", { hooks: [{ event: "Stop" }] }, /hooks\[0\]\.command must be a non-empty string/],
    ["a hook with a blank command", { hooks: [{ event: "Stop", command: "  " }] }, /hooks\[0\]\.command must be a non-empty string/],
    ["a hook whose matcher is not a string", { hooks: [{ event: "Stop", command: "x", matcher: 5 }] }, /hooks\[0\]\.matcher must be a string/],
    ["a hook whose matcher is not a valid regular expression", { hooks: [{ event: "PreToolUse", command: "x", matcher: "(unclosed" }] }, /hooks\[0\]\.matcher is not a valid regular expression/],
    ["mcpServers that is a list", { mcpServers: [] }, /mcpServers must be an object/],
    ["an MCP server with no command", { mcpServers: { s: {} } }, /mcpServers\.s\.command must be a non-empty string/],
    ["an MCP server whose args are not strings", { mcpServers: { s: { command: "x", args: [1] } } }, /mcpServers\.s\.args must be a list of strings/],
    ["an MCP server whose env values are not strings", { mcpServers: { s: { command: "x", env: { A: 1 } } } }, /mcpServers\.s\.env must map names to strings/],
  ])("refuses %s, naming the file and the problem", async (_name, content, message) => {
    await writeProject(content);
    await expect(loadSettings(cwd, home)).rejects.toThrow(message);
    await expect(loadSettings(cwd, home)).rejects.toThrow(/Invalid settings file .*settings\.json/);
  });

  it("accepts every field in its documented shape", async () => {
    await writeProject({
      permissions: { allow: ["a"], deny: ["b"], defaultMode: "plan" },
      hooks: [{ event: "PreToolUse", matcher: "run_command", command: "node check.js" }],
      mcpServers: { files: { command: "npx", args: ["-y", "srv"], env: { TOKEN: "x" } } },
    });
    const settings = await loadSettings(cwd, home);
    expect(settings.hooks).toHaveLength(1);
    expect(Object.keys(settings.mcpServers)).toEqual(["files"]);
  });
});

describe("settings: what a project asks to be trusted with", () => {
  const project = {
    permissions: { allow: ["run_command(npm test:*)"], deny: ["run_command(rm:*)"], defaultMode: "bypassPermissions" as const },
    hooks: [{ event: "Stop" as const, command: "echo project" }],
    mcpServers: { files: { command: "node", args: ["server.js"] } },
  };
  const user = {
    permissions: { allow: ["read_file"], deny: ["run_command(curl:*)"], defaultMode: "plan" as const },
    hooks: [{ event: "Stop" as const, command: "echo user" }],
    mcpServers: { mine: { command: "mine" } },
  };

  describe("projectRequests", () => {
    it("is the hooks, MCP servers and allow rules, and a default mode that loosens things", () => {
      expect(projectRequests(project)).toEqual({
        mcpServers: project.mcpServers,
        hooks: project.hooks,
        allow: ["run_command(npm test:*)"],
        defaultMode: "bypassPermissions",
      });
      expect(projectRequests({ permissions: { defaultMode: "acceptEdits" } }).defaultMode).toBe("acceptEdits");
    });

    it("does not count deny rules, or a default mode that is no looser than the default", () => {
      expect(projectRequests({ permissions: { deny: ["x"], defaultMode: "plan" } })).toEqual({ mcpServers: {}, hooks: [], allow: [] });
      expect(projectRequests({ permissions: { defaultMode: "default" } })).toEqual({ mcpServers: {}, hooks: [], allow: [] });
    });

    it("is empty for an empty file", () => {
      expect(projectRequests({})).toEqual({ mcpServers: {}, hooks: [], allow: [] });
    });
  });

  describe("hasProjectRequests", () => {
    it("is true if any one kind is present, and false for none", () => {
      expect(hasProjectRequests(projectRequests({}))).toBe(false);
      expect(hasProjectRequests(projectRequests({ permissions: { deny: ["x"] } }))).toBe(false);
      expect(hasProjectRequests(projectRequests({ hooks: project.hooks }))).toBe(true);
      expect(hasProjectRequests(projectRequests({ mcpServers: project.mcpServers }))).toBe(true);
      expect(hasProjectRequests(projectRequests({ permissions: { allow: ["x"] } }))).toBe(true);
      expect(hasProjectRequests(projectRequests({ permissions: { defaultMode: "acceptEdits" } }))).toBe(true);
    });
  });

  describe("mergeSettings", () => {
    it("takes everything from a project it trusts, the project winning the mode and a server of the same name", () => {
      const merged = mergeSettings({ user, project }, { trustProject: true });
      expect(merged.permissions.allow).toEqual(["read_file", "run_command(npm test:*)"]);
      expect(merged.permissions.deny).toEqual(["run_command(curl:*)", "run_command(rm:*)"]);
      expect(merged.permissions.defaultMode).toBe("bypassPermissions");
      expect(merged.hooks.map((hook) => hook.command)).toEqual(["echo user", "echo project"]);
      expect(Object.keys(merged.mcpServers).sort()).toEqual(["files", "mine"]);
    });

    it("takes only the careful parts of a project it does not trust: its deny rules", () => {
      const merged = mergeSettings({ user, project }, { trustProject: false });
      expect(merged.permissions.allow).toEqual(["read_file"]);
      expect(merged.permissions.deny).toEqual(["run_command(curl:*)", "run_command(rm:*)"]);
      expect(merged.hooks.map((hook) => hook.command)).toEqual(["echo user"]);
      expect(Object.keys(merged.mcpServers)).toEqual(["mine"]);
      expect(merged.permissions.defaultMode).toBe("plan"); // the user's, not the project's bypassPermissions
    });

    it("never lets an untrusted project replace the user's MCP server of the same name", () => {
      const merged = mergeSettings(
        { user: { mcpServers: { files: { command: "user-cmd" } } }, project: { mcpServers: { files: { command: "project-cmd" } } } },
        { trustProject: false },
      );
      expect(merged.mcpServers).toEqual({ files: { command: "user-cmd" } });
    });

    it("lets an untrusted project ask for a stricter mode, but not a looser one", () => {
      expect(mergeSettings({ user: {}, project: { permissions: { defaultMode: "plan" } } }, { trustProject: false }).permissions.defaultMode).toBe("plan");
      expect(mergeSettings({ user: {}, project: { permissions: { defaultMode: "default" } } }, { trustProject: false }).permissions.defaultMode).toBe("default");
      expect(mergeSettings({ user: {}, project: { permissions: { defaultMode: "acceptEdits" } } }, { trustProject: false }).permissions.defaultMode).toBeUndefined();
      expect(mergeSettings({ user: {}, project: { permissions: { defaultMode: "bypassPermissions" } } }, { trustProject: false }).permissions.defaultMode).toBeUndefined();
    });

    it("always applies the user's own settings, trusted project or not", () => {
      const merged = mergeSettings({ user, project: {} }, { trustProject: false });
      expect(merged.permissions.allow).toEqual(["read_file"]);
      expect(merged.hooks).toHaveLength(1);
      expect(Object.keys(merged.mcpServers)).toEqual(["mine"]);
    });
  });

  describe("readSettingsLayers and loadSettings", () => {
    let root: string;
    let home: string;
    let cwd: string;

    beforeEach(async () => {
      root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
      home = path.join(root, "home");
      cwd = path.join(root, "project");
      for (const base of [home, cwd]) await fs.mkdir(path.join(base, ".cortex"), { recursive: true });
      await fs.writeFile(path.join(home, ".cortex", "settings.json"), JSON.stringify(user));
      await fs.writeFile(path.join(cwd, ".cortex", "settings.json"), JSON.stringify(project));
    });

    afterEach(async () => {
      await fs.rm(root, { recursive: true, force: true });
    });

    it("reads the two layers apart", async () => {
      const layers = await readSettingsLayers(cwd, home);
      expect(layers.user.hooks?.[0]?.command).toBe("echo user");
      expect(layers.project.hooks?.[0]?.command).toBe("echo project");
    });

    it("loadSettings trusts the project by default, and leaves its commands out when told not to", async () => {
      expect((await loadSettings(cwd, home)).hooks).toHaveLength(2);
      expect((await loadSettings(cwd, home, { trustProject: true })).hooks).toHaveLength(2);
      const careful = await loadSettings(cwd, home, { trustProject: false });
      expect(careful.hooks).toHaveLength(1);
      expect(careful.permissions.allow).toEqual(["read_file"]);
    });
  });
});
