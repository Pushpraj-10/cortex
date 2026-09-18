import { describe, expect, it } from "vitest";
import { toToolSpec } from "../../src/core/to-tool-spec.js";
import type { ToolDefinition } from "@cortex/tools";

describe("toToolSpec", () => {
  it("maps a ToolDefinition to a ToolSpec, renaming parametersSchema", () => {
    const tool: ToolDefinition = {
      name: "read_file",
      description: "Read a file",
      parametersSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      handler: async () => ({ ok: true, value: undefined }),
    };

    expect(toToolSpec(tool)).toEqual({
      name: "read_file",
      description: "Read a file",
      parametersSchema: tool.parametersSchema,
    });
  });
});
