import React from "react";
import { describe, expect, it } from "vitest";
import type { ToolPreview } from "@cortex/tools";
import { PermissionPrompt, permissionPromptRows } from "../../../src/ui/components/Prompts.js";
import { renderFrame } from "../support/render-frame.js";

const lines = (count: number) => Array.from({ length: count }, (_, i) => `line${i + 1}`).join("\n");

const small: ToolPreview = { kind: "diff", path: "a.ts", before: "a\nb\nc", after: "a\nB\nc", startLine: 1 };
const big: ToolPreview = { kind: "diff", path: "n.ts", before: "", after: lines(40), startLine: 1, isNew: true };
const longLines: ToolPreview = { kind: "diff", path: "n.ts", before: "", after: `${"x".repeat(200)}\n${"y".repeat(200)}`, startLine: 1, isNew: true };
const command: ToolPreview = { kind: "command", command: "npm run build\n  && npm test\n  && echo " + "z".repeat(200) };

const draw = async (summary: string, preview: ToolPreview | undefined, width: number, maxPreviewLines: number) =>
  (await renderFrame(<PermissionPrompt summary={summary} preview={preview} width={width} maxPreviewLines={maxPreviewLines} />, width)).split("\n");

describe("permissionPromptRows", () => {
  it("is the four rows of the plain prompt when there is nothing to preview", () => {
    expect(permissionPromptRows(undefined, 12)).toBe(4);
  });

  it("adds the rows of the preview", () => {
    expect(permissionPromptRows(small, 12)).toBe(4 + 4);
    expect(permissionPromptRows(big, 10)).toBe(4 + 11);
  });
});

describe("PermissionPrompt", () => {
  it("asks about a call with nothing to preview in four rows", async () => {
    const rows = await draw("Read a.ts", undefined, 60, 12);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toContain("Allow Read a.ts?");
    expect(rows[2]).toContain("y / enter allow · n / esc deny");
  });

  it("shows what an edit will change, in the question and as a diff, before the keys", async () => {
    const rows = await draw("Edit a.ts", small, 60, 12);
    expect(rows[1]).toContain("Allow Edit a.ts (+1 -1)?");
    expect(rows.join("\n")).toContain("2 - b");
    expect(rows.join("\n")).toContain("2 + B");
    expect(rows[rows.length - 2]).toContain("y / enter allow");
  });

  it("shows a command that is about to run", async () => {
    const rows = (await draw("Run npm run build", { kind: "command", command: "npm run build" }, 60, 12)).join("\n");
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
  ] as [string, ToolPreview | undefined, number, number][])("takes exactly the rows it reserves: %s", async (_name, preview, width, maxPreviewLines) => {
    const rows = await draw("Edit some/very/long/path/to/a/file/that/keeps/going/and/going.ts", preview, width, maxPreviewLines);
    expect(rows).toHaveLength(permissionPromptRows(preview, maxPreviewLines));
  });

  it("says how many diff lines it left out", async () => {
    const rows = await draw("Write n.ts", big, 60, 5);
    expect(rows.join("\n")).toContain("… 35 more lines");
  });
});
