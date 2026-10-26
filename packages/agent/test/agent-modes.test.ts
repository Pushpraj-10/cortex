import { describe, expect, it } from "vitest";
import {
  AGENT_MODE_IDS,
  agentDeniedMessage,
  getAgentMode,
  isAgentModeId,
  isToolAllowed,
  listAgentModes,
} from "../src/agent-modes.js";

const tool = (name: string, kind: "read" | "edit" | "execute") => ({ name, kind });

describe("agent mode definitions", () => {
  it("has the three security modes, in pipeline order", () => {
    expect(AGENT_MODE_IDS).toEqual(["scan", "suggest", "fix"]);
    expect(listAgentModes().map((mode) => mode.id)).toEqual(["scan", "suggest", "fix"]);
  });

  it("recognizes only the mode ids", () => {
    expect(isAgentModeId("scan")).toBe(true);
    expect(isAgentModeId("off")).toBe(false);
    expect(isAgentModeId(undefined)).toBe(false);
  });

  it("gives every mode a description and a prompt that names its role", () => {
    for (const mode of listAgentModes()) {
      expect(mode.description.length).toBeGreaterThan(0);
      expect(mode.prompt).toContain(`Agent mode: ${mode.id.toUpperCase()}`);
    }
  });

  it("chains the modes through the report files", () => {
    expect(getAgentMode("scan").prompt).toContain('stage "scan"');
    expect(getAgentMode("suggest").prompt).toContain(".cortex/security/scan.md");
    expect(getAgentMode("suggest").prompt).toContain('stage "suggestions"');
    expect(getAgentMode("fix").prompt).toContain(".cortex/security/suggestions.md");
    expect(getAgentMode("fix").prompt).toContain('stage "fixes"');
  });
});

describe("isToolAllowed", () => {
  it("puts no limit on the general agent (no mode)", () => {
    for (const kind of ["read", "edit", "execute"] as const) expect(isToolAllowed(undefined, tool("x", kind))).toBe(true);
  });

  it("lets scan and suggest read and save their report, and nothing else", () => {
    for (const agent of ["scan", "suggest"] as const) {
      expect(isToolAllowed(agent, tool("read_file", "read"))).toBe(true);
      expect(isToolAllowed(agent, tool("save_security_report", "edit"))).toBe(true);
      expect(isToolAllowed(agent, tool("write_file", "edit"))).toBe(false);
      expect(isToolAllowed(agent, tool("run_command", "execute"))).toBe(false);
      expect(isToolAllowed(agent, tool("some_mcp_tool", "execute"))).toBe(false);
    }
  });

  it("lets fix use every kind", () => {
    for (const kind of ["read", "edit", "execute"] as const) expect(isToolAllowed("fix", tool("x", kind))).toBe(true);
  });
});

describe("agentDeniedMessage", () => {
  it("says which agent, which tool and what to do instead", () => {
    const message = agentDeniedMessage("scan", "write_file", "edit");
    expect(message).toContain("scan agent may not use write_file");
    expect(message).toContain("/agent fix");
    expect(message).toContain("Do not retry");
  });

  it("does not point fix at itself", () => {
    expect(agentDeniedMessage("fix", "x", "execute")).not.toContain("/agent fix");
  });
});
