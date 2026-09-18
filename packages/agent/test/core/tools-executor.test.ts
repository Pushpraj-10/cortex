import { describe, expect, it } from "vitest";
import { registerTool } from "@cortex/tools";
import { ok, err, CortexError } from "@cortex/shared";
import { createToolsExecutor } from "../../src/core/tools-executor.js";

describe("createToolsExecutor", () => {
  it("looks up a registered tool by name and runs its handler with the given args and cwd", async () => {
    registerTool({
      name: "executor-test-echo",
      description: "Echoes args back",
      parametersSchema: { type: "object" },
      handler: async (args, context) => ok({ args, cwd: context.cwd }),
    });

    const executor = createToolsExecutor("/workspace");
    const result = await executor.execute("executor-test-echo", { a: 1 });

    expect(result).toEqual({ ok: true, value: { args: { a: 1 }, cwd: "/workspace" } });
  });

  it("propagates a failing tool's error Result", async () => {
    registerTool({
      name: "executor-test-fail",
      description: "Always fails",
      parametersSchema: { type: "object" },
      handler: async () => err(new CortexError("boom", "TEST_BOOM")),
    });

    const executor = createToolsExecutor("/workspace");
    const result = await executor.execute("executor-test-fail", {});

    expect(result.ok).toBe(false);
  });

  it("throws UnknownToolError for an unregistered tool name", async () => {
    const executor = createToolsExecutor("/workspace");
    await expect(executor.execute("executor-test-nonexistent", {})).rejects.toThrow();
  });
});
