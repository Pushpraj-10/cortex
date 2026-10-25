import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSettings } from "../src/settings.js";

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
