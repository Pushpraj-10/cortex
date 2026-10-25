import React from "react";
import { describe, expect, it } from "vitest";
import { StatusLine } from "../../../src/ui/components/StatusLine.js";
import { displayWidth } from "../../../src/format/table.js";
import { renderFrame } from "../support/render-frame.js";

const draw = (props: { model?: string; mode?: string; cwd?: string }, width = 80) =>
  renderFrame(<StatusLine model={props.model ?? "llama3.1 (ollama)"} mode={props.mode ?? "default"} cwd={props.cwd ?? "D:\\proj\\demo"} />, width);

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
