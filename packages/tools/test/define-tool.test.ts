import { describe, expect, it } from "vitest";
import { ToolError, argText, defineTool } from "../src/define-tool.js";

const base = { name: "t", description: "d", kind: "read" as const, parametersSchema: {} };

describe("defineTool", () => {
  it("wraps a returned value in an ok Result and keeps the definition fields", async () => {
    const tool = defineTool<{ n: number }, number>({
      ...base,
      failure: () => "failed",
      run: async (args) => args.n * 2,
    });
    expect(tool.name).toBe("t");
    expect(tool.kind).toBe("read");
    expect(await tool.handler({ n: 2 }, { cwd: "." })).toEqual({ ok: true, value: 4 });
  });

  it("turns a throw into a ToolError Result with the failure prefix and the cause", async () => {
    const cause = new Error("disk on fire");
    const tool = defineTool<{ path: string }, never>({
      ...base,
      failure: (args) => `Failed at ${args.path}`,
      run: async () => {
        throw cause;
      },
    });
    const result = await tool.handler({ path: "a.ts" }, { cwd: "." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ToolError);
      expect(result.error.message).toBe("Failed at a.ts: Error: disk on fire");
      expect(result.error.code).toBe("TOOL_FAILED");
      expect(result.error.cause).toBe(cause);
    }
  });

  it("passes the execution context to run", async () => {
    const tool = defineTool<unknown, string>({ ...base, failure: () => "", run: async (_args, context) => context.cwd });
    expect(await tool.handler({}, { cwd: "/work" })).toEqual({ ok: true, value: "/work" });
  });
});

describe("argText", () => {
  it("returns strings unchanged and '?' for anything else", () => {
    expect(argText("a.ts")).toBe("a.ts");
    expect(argText(undefined)).toBe("?");
    expect(argText(123)).toBe("?");
  });
});
