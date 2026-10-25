import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTool } from "@cortex/tools";
import { bootstrap } from "../src/bootstrap.js";

describe("bootstrap", () => {
  let root: string;
  let cwd: string;
  let home: string;
  const env = { OLLAMA_MODEL: "llama3.1" };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    cwd = path.join(root, "project");
    home = path.join(root, "home");
    await fs.mkdir(cwd);
    await fs.mkdir(home);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("builds a session, reports the chosen provider and model, and registers the task tool", async () => {
    const result = await bootstrap({ cwd, interactive: true, env, home });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provider).toBe("ollama");
    expect(result.value.model).toBe("llama3.1");
    expect(typeof result.value.initialSession.chat).toBe("function");
    expect(typeof result.value.newSession().chat).toBe("function");
    expect(getTool("task").kind).toBe("read");
    expect(getTool("read_file").name).toBe("read_file");
    result.value.close();
  });

  it("defaults to the default permission mode, with settings and --mode overriding it in that order", async () => {
    const plain = await bootstrap({ cwd, interactive: true, env, home });
    expect(plain.ok && plain.value.policy.mode).toBe("default");

    await fs.mkdir(path.join(cwd, ".cortex"));
    await fs.writeFile(path.join(cwd, ".cortex", "settings.json"), JSON.stringify({ permissions: { defaultMode: "plan" } }));
    const fromSettings = await bootstrap({ cwd, interactive: true, env, home });
    expect(fromSettings.ok && fromSettings.value.policy.mode).toBe("plan");

    const fromFlag = await bootstrap({ cwd, interactive: true, env, home, mode: "acceptEdits" });
    expect(fromFlag.ok && fromFlag.value.policy.mode).toBe("acceptEdits");
  });

  it("carries permission rules and hooks from settings into the policy", async () => {
    await fs.mkdir(path.join(cwd, ".cortex"));
    await fs.writeFile(
      path.join(cwd, ".cortex", "settings.json"),
      JSON.stringify({
        permissions: { allow: ["run_command(npm test:*)"], deny: ["run_command(rm:*)"] },
        hooks: [{ event: "Stop", command: "echo done" }],
      }),
    );

    const result = await bootstrap({ cwd, interactive: true, env, home });

    expect(result.ok && result.value.policy.rules).toEqual({ allow: ["run_command(npm test:*)"], deny: ["run_command(rm:*)"] });
    expect(result.ok && result.value.policy.hooks).toEqual([{ event: "Stop", command: "echo done" }]);
  });

  it("refuses calls that need approval in a non-interactive run, but routes them to the UI in an interactive one", async () => {
    const quiet = await bootstrap({ cwd, interactive: false, env, home });
    expect(quiet.ok && (await quiet.value.policy.askPermission("run_command", {}))).toBe(false);

    const interactive = await bootstrap({ cwd, interactive: true, env, home });
    if (!interactive.ok) throw new Error("bootstrap failed");
    interactive.value.permissions.onRequest((request) => request.resolve(true));
    await expect(interactive.value.policy.askPermission("run_command", {})).resolves.toBe(true);
  });

  it("fails with the provider's configuration error when nothing is configured", async () => {
    const result = await bootstrap({ cwd, interactive: true, env: {}, home });
    expect(!result.ok && result.error.code).toBe("CLI_MISSING_OLLAMA_MODEL");
  });

  it("fails with a bootstrap error, naming the file, when settings.json is malformed", async () => {
    await fs.mkdir(path.join(cwd, ".cortex"));
    await fs.writeFile(path.join(cwd, ".cortex", "settings.json"), "{ nope");

    const result = await bootstrap({ cwd, interactive: true, env, home });

    expect(!result.ok && result.error.code).toBe("CLI_BOOTSTRAP_FAILED");
    expect(!result.ok && result.error.message).toContain("settings.json");
  });
});
