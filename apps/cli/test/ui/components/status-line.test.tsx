import React from "react";
import { describe, expect, it } from "vitest";
import type { AgentModeId } from "@cortex/agent";
import { AGENT_SYMBOLS, StatusLine } from "../../../src/ui/components/StatusLine.js";
import { displayWidth } from "../../../src/format/table.js";
import { renderFrame } from "../support/render-frame.js";

const draw = (props: { model?: string; mode?: string; cwd?: string; agent?: AgentModeId }, width = 80) =>
  renderFrame(
    <StatusLine model={props.model ?? "llama3.1 (ollama)"} mode={props.mode ?? "default"} agent={props.agent} cwd={props.cwd ?? "D:\\proj\\demo"} />,
    width,
  );

describe("StatusLine", () => {
  it("says '? for shortcuts' on the left and the model and folder on the right", async () => {
    const line = await draw({});
    expect(line.startsWith(" ? for shortcuts")).toBe(true);
    expect(line.endsWith("llama3.1 (ollama) · D:\\proj\\demo")).toBe(true);
    expect(line.split("\n")).toHaveLength(1);
  });

  it.each([
    ["acceptEdits", "⏵⏵ accept edits on (shift+tab to cycle)"],
    ["plan", "⏵⏵ plan mode on (shift+tab to cycle)"],
    ["bypassPermissions", "⏵⏵ bypass permissions on (shift+tab to cycle)"],
  ])("announces the %s mode in place of the shortcuts hint", async (mode, text) => {
    const line = await draw({ mode });
    expect(line).toContain(text);
    expect(line).not.toContain("? for shortcuts");
  });

  it("names the active agent first on the left, before the shortcuts hint or the permission mode", async () => {
    const plain = await draw({ agent: "scan" });
    expect(plain.startsWith(` ${AGENT_SYMBOLS.scan} scan agent · ? for shortcuts`)).toBe(true);
    expect(plain.endsWith("llama3.1 (ollama) · D:\\proj\\demo")).toBe(true);

    const planning = await draw({ agent: "fix", mode: "plan" });
    expect(planning.startsWith(` ${AGENT_SYMBOLS.fix} fix agent · ⏵⏵ plan mode on`)).toBe(true);
  });

  it("marks each agent with its own symbol, none of them the permission mode's ⏵⏵", async () => {
    const symbols = Object.values(AGENT_SYMBOLS);
    expect(new Set(symbols).size).toBe(symbols.length);
    for (const symbol of symbols) {
      expect(symbol).not.toContain("⏵");
      expect(displayWidth(symbol)).toBe(1); // one column, so the line's width arithmetic holds
    }
    for (const agent of ["scan", "suggest", "fix"] as const) {
      const line = await draw({ agent });
      expect(line.startsWith(` ${AGENT_SYMBOLS[agent]} ${agent} agent`)).toBe(true);
    }
  });

  it("adds the agent's key hint only when the whole right side still fits beside it, never at the folder's expense", async () => {
    const roomy = await draw({ agent: "scan" }, 140);
    expect(roomy.startsWith(` ${AGENT_SYMBOLS.scan} scan agent (ctrl+g to cycle) · ? for shortcuts`)).toBe(true);
    expect(roomy.endsWith("llama3.1 (ollama) · D:\\proj\\demo")).toBe(true);

    // At 80 columns the hint would have cut the folder, so it is left out and the folder stays whole.
    const snug = await draw({ agent: "scan" }, 80);
    expect(snug).not.toContain("ctrl+g");
    expect(snug.endsWith("llama3.1 (ollama) · D:\\proj\\demo")).toBe(true);

    // A long folder needs the room itself.
    const longFolder = await draw({ agent: "scan", cwd: `D:\\${"deeply\\".repeat(10)}project` }, 140);
    expect(longFolder).not.toContain("ctrl+g");
    expect(longFolder.endsWith("project")).toBe(true);
  });

  it("drops the agent's key hint before the permission mode's, when the line gets tight", async () => {
    const roomy = await draw({ agent: "fix", mode: "plan" }, 140);
    expect(roomy).toContain(`${AGENT_SYMBOLS.fix} fix agent (ctrl+g to cycle) · ⏵⏵ plan mode on (shift+tab to cycle)`);

    const tight = await draw({ agent: "fix", mode: "plan" }, 80);
    expect(tight).not.toContain("ctrl+g");
    expect(tight).toContain(`${AGENT_SYMBOLS.fix} fix agent · ⏵⏵ plan mode on (shift+tab to cycle)`);

    const tighter = await draw({ agent: "scan" }, 60);
    expect(tighter).not.toContain("ctrl+g");
    expect(tighter.startsWith(` ${AGENT_SYMBOLS.scan} scan agent · ? for shortcuts`)).toBe(true);
  });

  it.each(["scan", "suggest", "fix"] as const)("shows the %s agent's name in full, whatever the width allows", async (agent) => {
    expect(await draw({ agent }, 140)).toContain(`${agent} agent (ctrl+g to cycle) ·`);
    expect(await draw({ agent }, 70)).toContain(`${agent} agent`);
  });

  it("says nothing about an agent when none is active", async () => {
    expect(await draw({})).not.toContain("agent");
  });

  it.each(["default", "acceptEdits", "plan", "bypassPermissions"])("stays one row that fits at every width with an agent active (%s mode)", async (mode) => {
    for (let width = 20; width <= 140; width += 5) {
      const line = await draw({ mode, agent: "suggest" }, width);
      expect(line.split("\n"), `width ${width}`).toHaveLength(1);
      expect(displayWidth(line), `width ${width}`).toBeLessThanOrEqual(width);
    }
  });

  it("keeps the model and cuts a long folder from its start, in one row that fits", async () => {
    const line = await draw({ cwd: `D:\\${"deeply\\".repeat(20)}project` }, 60);
    expect(line.split("\n")).toHaveLength(1);
    expect(displayWidth(line)).toBeLessThanOrEqual(60);
    expect(line).toContain("llama3.1 (ollama)");
    expect(line).toContain("…");
    expect(line.endsWith("project")).toBe(true);
  });
});

describe("StatusLine: branch, context and narrow terminals", () => {
  const full = {
    model: "gemini-3.8-flash (google)",
    mode: "default",
    cwd: "~/Project/Cortex",
    branch: "main",
    context: { used: 34_000, budget: 100_000 },
  };
  const row = (props: Partial<typeof full>, width: number) =>
    renderFrame(<StatusLine {...full} {...props} />, width);

  it("shows the model, how full the context is, the folder and the branch when there is room", async () => {
    const line = await row({}, 110);
    expect(line.startsWith(" ? for shortcuts")).toBe(true);
    expect(line.endsWith("gemini-3.8-flash (google) · 34% context · ~/Project/Cortex · (main)")).toBe(true);
  });

  it("shows a high context percentage as it is, so it is noticed before the conversation is compacted", async () => {
    expect(await row({ context: { used: 92_000, budget: 100_000 } }, 110)).toContain("92% context");
  });

  it("leaves out the context and the branch until there is something to show", async () => {
    const line = await row({ branch: undefined, context: undefined }, 110);
    expect(line).not.toContain("context");
    expect(line).not.toContain("(main)");
    expect(line.endsWith("gemini-3.8-flash (google) · ~/Project/Cortex")).toBe(true);
  });

  it("drops the folder first on a narrow terminal, and keeps the model to the end", async () => {
    const narrow = await row({}, 62);
    expect(narrow).toContain("gemini-3.8-flash (google)");
    expect(narrow).not.toContain("Project");
    const tiny = await row({}, 45);
    expect(tiny).toContain("gemini");
    expect(tiny).not.toContain("context");
  });

  it("announces a non-default mode on the left and still fits the right side beside it", async () => {
    const line = await row({ mode: "acceptEdits" }, 100);
    expect(line.startsWith(" ⏵⏵ accept edits on (shift+tab to cycle)")).toBe(true);
    expect(line).toContain("34% context");
  });

  it("drops the cycle hint rather than cutting the model name", async () => {
    const line = await row({ mode: "acceptEdits" }, 64);
    expect(line).toContain("⏵⏵ accept edits on");
    expect(line).not.toContain("shift+tab");
    expect(line).toContain("gemini-3.8-flash (google)");
    expect(line).toContain("34% context");
  });

  it.each(["default", "acceptEdits", "plan", "bypassPermissions"])("is one row that fits at every width from 20 to 140 columns (%s mode)", async (mode) => {
    for (let width = 20; width <= 140; width += 5) {
      const line = await row({ mode }, width);
      expect(line.split("\n"), `width ${width}`).toHaveLength(1);
      expect(displayWidth(line), `width ${width}`).toBeLessThanOrEqual(width);
    }
  });
});
