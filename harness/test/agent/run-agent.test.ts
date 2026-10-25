import { describe, expect, it } from "vitest";
import { runAgent } from "../../src/agent/run-agent";
import type { AgentOptions } from "../../src/agent/types";
import type { ContentBlock, LlmProvider, LlmResponse } from "../../src/llm/types";
import type { ToolDef } from "../../src/tools/types";

function scripted(...responses: ContentBlock[][]): LlmProvider {
  let i = 0;
  return {
    async complete(): Promise<LlmResponse> {
      return { content: responses[i++] ?? [{ type: "text", text: "done" }], stopReason: "end_turn" };
    },
  };
}

const echo: ToolDef = {
  name: "Echo",
  description: "",
  inputSchema: {},
  readOnly: true,
  async run(input) {
    return `echo:${String(input.msg)}`;
  },
};
const danger: ToolDef = { ...echo, name: "Danger", readOnly: false };

function opts(provider: LlmProvider, extra: Partial<AgentOptions> = {}): AgentOptions {
  return {
    provider,
    system: "",
    tools: [echo, danger],
    mode: "default",
    rules: { allow: [], deny: [] },
    hooks: [],
    cwd: process.cwd(),
    askPermission: async () => true,
    ...extra,
  };
}

describe("runAgent", () => {
  it("runs tools and feeds results back until the model replies with text", async () => {
    const provider = scripted([{ type: "tool_use", id: "1", name: "Echo", input: { msg: "hi" } }], [{ type: "text", text: "all done" }]);
    const r = await runAgent([], "go", opts(provider));
    expect(r.text).toBe("all done");
    expect(r.stopReason).toBe("end_turn");
    expect(JSON.stringify(r.messages[2]!.content)).toContain("echo:hi");
  });

  it("reports declined approvals to the model as errors", async () => {
    const provider = scripted([{ type: "tool_use", id: "1", name: "Danger", input: {} }]);
    const r = await runAgent([], "go", opts(provider, { askPermission: async () => false }));
    expect(JSON.stringify(r.messages[2]!.content)).toContain("declined");
  });

  it("turns unknown tools into error results instead of throwing", async () => {
    const provider = scripted([{ type: "tool_use", id: "1", name: "Nope", input: {} }]);
    const r = await runAgent([], "go", opts(provider));
    expect(JSON.stringify(r.messages[2]!.content)).toContain("Unknown tool");
  });

  it("stops at maxTurns", async () => {
    const loop = scripted(...Array.from({ length: 5 }, (): ContentBlock[] => [{ type: "tool_use", id: "x", name: "Echo", input: {} }]));
    const r = await runAgent([], "go", opts(loop, { maxTurns: 2 }));
    expect(r.stopReason).toBe("max_turns");
  });
});
