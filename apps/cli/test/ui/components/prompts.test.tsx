import React from "react";
import { describe, expect, it } from "vitest";
import type { ToolPreview } from "@cortex/tools";
import { displayWidth } from "../../../src/format/table.js";
import { permissionChoices, type PermissionChoice } from "../../../src/format/permission-choices.js";
import { PermissionPrompt, SETUP_PROMPT_ROWS, SetupPrompt, permissionPromptRows } from "../../../src/ui/components/Prompts.js";
import { renderFrame } from "../support/render-frame.js";

const lines = (count: number) => Array.from({ length: count }, (_, i) => `line${i + 1}`).join("\n");

const small: ToolPreview = { kind: "diff", path: "a.ts", before: "a\nb\nc", after: "a\nB\nc", startLine: 1 };
const big: ToolPreview = { kind: "diff", path: "n.ts", before: "", after: lines(40), startLine: 1, isNew: true };
const longLines: ToolPreview = { kind: "diff", path: "n.ts", before: "", after: `${"x".repeat(200)}\n${"y".repeat(200)}`, startLine: 1, isNew: true };
const command: ToolPreview = { kind: "command", command: "npm run build\n  && npm test\n  && echo " + "z".repeat(200) };

const three = permissionChoices("edit_file", "edit", { path: "a.ts" });
const two = permissionChoices("read_file", "read", { path: "a.ts" });

const draw = async (
  summary: string,
  preview: ToolPreview | undefined,
  width: number,
  maxPreviewLines: number,
  choices: PermissionChoice[] = three,
  selectedIndex = 0,
) =>
  (await renderFrame(<PermissionPrompt summary={summary} preview={preview} width={width} maxPreviewLines={maxPreviewLines} choices={choices} selectedIndex={selectedIndex} />, width)).split("\n");

describe("permissionPromptRows", () => {
  it("is a blank row, the title, the question, the key hint and one row per choice when there is nothing to preview", () => {
    expect(permissionPromptRows(undefined, 12, 3)).toBe(4 + 3);
    expect(permissionPromptRows(undefined, 12, 2)).toBe(4 + 2);
  });

  it("adds the rows of the preview", () => {
    expect(permissionPromptRows(small, 12, 3)).toBe(4 + 3 + 4);
    expect(permissionPromptRows(big, 10, 3)).toBe(4 + 3 + 11);
  });
});

describe("PermissionPrompt", () => {
  it("asks about a call with nothing to preview, listing the choices numbered and the keys", async () => {
    const rows = await draw("Read a.ts", undefined, 70, 12, two);
    expect(rows).toHaveLength(4 + 2);
    expect(rows[0]).toBe("");
    expect(rows[1]).toContain("Read a.ts");
    expect(rows[2]).toContain("Do you want to proceed?");
    expect(rows[3]).toContain("❯ 1. Yes");
    expect(rows[4]).toContain("  2. No (esc)");
    expect(rows[5]).toContain("↑/↓ to select · enter to confirm · esc to deny");
  });

  it("marks whichever choice the arrow keys are on", async () => {
    const third = await draw("Edit a.ts", undefined, 90, 12, three, 2);
    expect(third.join("\n")).toContain("  1. Yes");
    expect(third.join("\n")).toContain("  2. Yes, and don't ask again for edits this session (shift+tab)");
    expect(third.join("\n")).toContain("❯ 3. No (esc)");
    expect(third.join("\n").match(/❯/g)).toHaveLength(1);
  });

  it("has no border", async () => {
    const rows = (await draw("Edit a.ts", small, 80, 12)).join("\n");
    expect(rows).not.toMatch(/[╭╮╰╯│─]/);
  });

  it("shows what an edit will change, in the title and as a diff, before the question and the choices", async () => {
    const rows = await draw("Edit a.ts", small, 80, 12);
    expect(rows[1]).toContain("Edit a.ts (+1 -1)");
    expect(rows.join("\n")).toContain("2 - b");
    expect(rows.join("\n")).toContain("2 + B");
    expect(rows.findIndex((row) => row.includes("2 + B"))).toBeLessThan(rows.findIndex((row) => row.includes("Do you want to proceed?")));
    expect(rows[rows.length - 1]).toContain("esc to deny");
  });

  it("shows a command that is about to run", async () => {
    const rows = (await draw("Run npm run build", { kind: "command", command: "npm run build" }, 70, 12)).join("\n");
    expect(rows).toContain("$ npm run build");
  });

  it.each([
    ["no preview", undefined, 60, 12],
    ["a small diff", small, 60, 12],
    ["a long diff cut at 5 lines", big, 60, 5],
    ["a long diff cut at 12 lines", big, 80, 12],
    ["very long lines in a narrow terminal", longLines, 40, 12],
    ["a multi-line command with a very long line", command, 50, 12],
    ["a multi-line command cut at 2 lines", command, 50, 2],
  ] as [string, ToolPreview | undefined, number, number][])("takes exactly the rows it reserves, none wider than the terminal: %s", async (_name, preview, width, maxPreviewLines) => {
    for (const choices of [three, two]) {
      const rows = await draw("Edit some/very/long/path/to/a/file/that/keeps/going/and/going.ts", preview, width, maxPreviewLines, choices);
      expect(rows).toHaveLength(permissionPromptRows(preview, maxPreviewLines, choices.length));
      for (const row of rows) expect(displayWidth(row)).toBeLessThanOrEqual(width);
    }
  });

  it("says how many diff lines it left out", async () => {
    const rows = await draw("Write n.ts", big, 70, 5);
    expect(rows.join("\n")).toContain("… 35 more lines");
  });
});

describe("SetupPrompt", () => {
  const draw = async (props: { error?: string }) =>
    (await renderFrame(<SetupPrompt title="Google Gemini" label="API key" hint="empty keeps the saved one" {...props} />, 80)).split("\n");

  it("asks the question and says what an empty answer does, in the rows it reserves and with no border", async () => {
    const rows = await draw({});
    expect(rows).toHaveLength(SETUP_PROMPT_ROWS);
    expect(rows[0]).toContain("Google Gemini — API key");
    expect(rows[1]).toContain("empty keeps the saved one · enter to confirm · esc to cancel");
    expect(rows.join("\n")).not.toMatch(/[╭╮╰╯│─]/);
  });

  it("shows why an answer was rejected in place of the hint", async () => {
    const rows = await draw({ error: "That key looks too short" });
    expect(rows).toHaveLength(SETUP_PROMPT_ROWS);
    expect(rows[1]).toContain("That key looks too short");
    expect(rows[1]).not.toContain("enter to confirm");
  });
});
