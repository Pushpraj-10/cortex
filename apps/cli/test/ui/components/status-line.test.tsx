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
