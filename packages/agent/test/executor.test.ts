import { describe, expect, it, vi, type Mock } from "vitest";
import { registerTool, type ToolDefinition, type ToolKind } from "@cortex/tools";
import { ok, err, CortexError } from "@cortex/core";
import { addRecoveryHint, createToolsExecutor } from "../src/executor.js";
import type { AgentPolicy } from "../src/types.js";

describe("createToolsExecutor", () => {
  it("looks up a registered tool by name and runs its handler with the given args and cwd", async () => {
    registerTool({
      name: "executor-test-echo",
      description: "Echoes args back",
      kind: "read" as const,
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
      kind: "read" as const,
      parametersSchema: { type: "object" },
      handler: async () => err(new CortexError("boom", "TEST_BOOM")),
    });

    const executor = createToolsExecutor("/workspace");
    const result = await executor.execute("executor-test-fail", {});

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TEST_BOOM");
  });

  it("returns an error Result (not a throw) for an unregistered tool, listing what is available", async () => {
    const executor = createToolsExecutor("/workspace");
    const result = await executor.execute("executor-test-nonexistent", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Unknown tool: executor-test-nonexistent");
      expect(result.error.message).toContain("executor-test-echo");
    }
  });

  it("passes the given signal through to the tool handler's context", async () => {
    let capturedSignal: AbortSignal | undefined;
    registerTool({
      name: "executor-test-signal",
      description: "Captures the signal it was called with",
      kind: "read" as const,
      parametersSchema: { type: "object" },
      handler: async (_args, context) => {
        capturedSignal = context.signal;
        return ok(null);
      },
    });

    const executor = createToolsExecutor("/workspace");
    const controller = new AbortController();
    await executor.execute("executor-test-signal", {}, controller.signal);

    expect(capturedSignal).toBe(controller.signal);
  });

  it("turns a handler that throws into an error Result", async () => {
    registerTool({
      name: "executor-test-throws",
      description: "Throws instead of returning a Result",
      kind: "read" as const,
      parametersSchema: { type: "object" },
      handler: async () => {
        throw new Error("kaboom");
      },
    });

    const result = await createToolsExecutor("/workspace").execute("executor-test-throws", {});
    expect(!result.ok && result.error.message).toBe("kaboom");
  });
});

describe("addRecoveryHint", () => {
  it("appends a hint for known failure causes", () => {
    const hinted = addRecoveryHint("Failed to read file at a.ts: Error: ENOENT: no such file");
    expect(hinted).toContain("Hint:");
    expect(hinted).toContain("find_files");
  });

  it("leaves unknown messages unchanged", () => {
    expect(addRecoveryHint("something else")).toBe("something else");
  });

  it("is applied to failures coming back through the executor", async () => {
    registerTool({
      name: "executor-test-enoent",
      description: "Fails like a missing file",
      kind: "read" as const,
      parametersSchema: { type: "object" },
      handler: async () => err(new CortexError("Failed to read file at x: Error: ENOENT", "TOOL_FAILED")),
    });

    const result = await createToolsExecutor("/workspace").execute("executor-test-enoent", {});
    expect(!result.ok && result.error.message).toContain("Hint:");
  });
});

describe("createToolsExecutor with a policy", () => {
  const exit = (code: number, message = "") => `node -e "process.stderr.write('${message}');process.exit(${code})"`;

  const handlers: Record<ToolKind, Mock<ToolDefinition["handler"]>> = {
    read: vi.fn<ToolDefinition["handler"]>().mockResolvedValue(ok("read ran")),
    edit: vi.fn<ToolDefinition["handler"]>().mockResolvedValue(ok("edit ran")),
    execute: vi.fn<ToolDefinition["handler"]>().mockResolvedValue(ok("execute ran")),
  };
  for (const kind of ["read", "edit", "execute"] as const) {
    registerTool({
      name: `policy-test-${kind}`,
      description: "",
      kind,
      parametersSchema: {},
      handler: (args, context) => handlers[kind]!(args, context),
    });
  }

  function policy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
    return { mode: "default", rules: { allow: [], deny: [] }, hooks: [], askPermission: vi.fn().mockResolvedValue(true), ...overrides };
  }

  it("runs a read tool without asking", async () => {
    const p = policy();
    const result = await createToolsExecutor("/w", p).execute("policy-test-read", {});
    expect(result).toEqual({ ok: true, value: "read ran" });
    expect(p.askPermission).not.toHaveBeenCalled();
  });

  it("asks before an edit and runs it when approved", async () => {
    const p = policy();
    const result = await createToolsExecutor("/w", p).execute("policy-test-edit", { path: "a" });
    expect(p.askPermission).toHaveBeenCalledWith("policy-test-edit", { path: "a" });
    expect(result).toEqual({ ok: true, value: "edit ran" });
  });

  it("does not run a declined call and tells the model not to retry it unchanged", async () => {
    handlers.execute!.mockClear();
    const p = policy({ askPermission: vi.fn().mockResolvedValue(false) });
    const result = await createToolsExecutor("/w", p).execute("policy-test-execute", { command: "ls" });

    expect(handlers.execute).not.toHaveBeenCalled();
    expect(!result.ok && result.error.message).toContain("declined");
    expect(!result.ok && result.error.message).toContain("Do not retry");
  });

  it("denies edits in plan mode without asking", async () => {
    const p = policy({ mode: "plan" });
    const result = await createToolsExecutor("/w", p).execute("policy-test-edit", {});
    expect(p.askPermission).not.toHaveBeenCalled();
    expect(!result.ok && result.error.message).toContain("Permission denied");
    expect(!result.ok && result.error.message).toContain("plan");
  });

  it("auto-allows edits in acceptEdits mode but still asks for execute", async () => {
    const p = policy({ mode: "acceptEdits" });
    const executor = createToolsExecutor("/w", p);
    await executor.execute("policy-test-edit", {});
    expect(p.askPermission).not.toHaveBeenCalled();
    await executor.execute("policy-test-execute", {});
    expect(p.askPermission).toHaveBeenCalledTimes(1);
  });

  it("sees a mode change made after the executor was created", async () => {
    const p = policy();
    const executor = createToolsExecutor("/w", p);
    p.mode = "plan";
    const result = await executor.execute("policy-test-edit", {});
    expect(result.ok).toBe(false);
  });

  it("honours allow and deny rules", async () => {
    const allowed = policy({ rules: { allow: ["policy-test-execute"], deny: [] } });
    await createToolsExecutor("/w", allowed).execute("policy-test-execute", {});
    expect(allowed.askPermission).not.toHaveBeenCalled();

    const denied = policy({ mode: "bypassPermissions", rules: { allow: [], deny: ["policy-test-edit"] } });
    const result = await createToolsExecutor("/w", denied).execute("policy-test-edit", {});
    expect(!result.ok && result.error.message).toContain("Permission denied");
  });

  it("blocks the call when a PreToolUse hook exits with code 2, passing its message back", async () => {
    handlers.read!.mockClear();
    const p = policy({ hooks: [{ event: "PreToolUse", matcher: "policy-test-read", command: exit(2, "not today") }] });
    const result = await createToolsExecutor(process.cwd(), p).execute("policy-test-read", {});

    expect(handlers.read).not.toHaveBeenCalled();
    expect(!result.ok && result.error.message).toContain("Blocked by hook: not today");
  });

  it("runs the tool but adds a note when a PostToolUse hook blocks", async () => {
    const p = policy({ hooks: [{ event: "PostToolUse", command: exit(2, "check the output") }] });
    const result = await createToolsExecutor(process.cwd(), p).execute("policy-test-read", {});
    expect(result).toEqual({ ok: true, value: { result: "read ran", hookNote: "check the output" } });
  });
});
