import { describe, expect, it } from "vitest";
import { UnknownToolError, getTool, listTools, registerTool } from "../src/registry.js";
import type { ToolDefinition } from "../src/types.js";

const tool = (name: string): ToolDefinition => ({
  name,
  description: "",
  parametersSchema: {},
  kind: "read",
  handler: async () => ({ ok: true, value: null }),
});

describe("tool registry", () => {
  it("returns a registered tool by name and lists it", () => {
    const t = tool("registry-test-a");
    registerTool(t);
    expect(getTool("registry-test-a")).toBe(t);
    expect(listTools()).toContain(t);
  });

  it("replaces a tool registered twice under the same name", () => {
    registerTool(tool("registry-test-b"));
    const replacement = tool("registry-test-b");
    registerTool(replacement);
    expect(getTool("registry-test-b")).toBe(replacement);
  });

  it("throws UnknownToolError for an unregistered name", () => {
    expect(() => getTool("registry-test-missing")).toThrow(UnknownToolError);
  });
});
