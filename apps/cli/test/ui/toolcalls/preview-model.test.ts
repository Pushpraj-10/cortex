import { describe, expect, it } from "vitest";
import type { ToolPreview } from "@cortex/tools";
import { changeStats, commandLines, diffOf, previewRows, type DiffPreview } from "../../../src/ui/toolcalls/preview-model.js";

const lines = (count: number) => Array.from({ length: count }, (_, i) => `line${i + 1}`).join("\n");

const edit = (before: string, after: string, extra: Partial<DiffPreview> = {}): DiffPreview => ({ kind: "diff", path: "a.ts", before, after, startLine: 1, ...extra });

describe("diffOf", () => {
  it("diffs a preview from its start line", () => {
    const diff = diffOf(edit("a\nb", "a\nB", { startLine: 5 }));
    expect([diff.added, diff.removed]).toEqual([1, 1]);
    expect(diff.rows[0]).toMatchObject({ kind: "context", oldLine: 5 });
  });

  it("computes a preview's diff once and hands back the same object after that", () => {
    const preview = edit("a", "b");
    expect(diffOf(preview)).toBe(diffOf(preview));
  });
});

describe("changeStats", () => {
  it("counts added and removed lines of a file change", () => {
    expect(changeStats(edit("a\nb\nc", "a\nX\nY\nc"))).toEqual({ added: 2, removed: 1, isNew: false });
  });

  it("marks a new file", () => {
    expect(changeStats(edit("", "x\ny", { isNew: true }))).toEqual({ added: 2, removed: 0, isNew: true });
  });

  it("is undefined for a command, or no preview", () => {
    expect(changeStats({ kind: "command", command: "ls" })).toBeUndefined();
    expect(changeStats(undefined)).toBeUndefined();
  });
});

describe("commandLines", () => {
  it("splits a multi-line command", () => {
    expect(commandLines({ kind: "command", command: "a\nb" })).toEqual(["a", "b"]);
  });
});

describe("previewRows", () => {
  it("is zero for no preview or a change that changes nothing", () => {
    expect(previewRows(undefined, 12)).toBe(0);
    expect(previewRows(edit("same", "same"), 12)).toBe(0);
  });

  it("is one row per diff row when it all fits", () => {
    // context a, del b, add B, context c
    expect(previewRows(edit("a\nb\nc", "a\nB\nc"), 12)).toBe(4);
  });

  it("is the limit plus one row for the 'more lines' note when the diff is longer", () => {
    const preview = edit("", lines(30), { isNew: true });
    expect(previewRows(preview, 10)).toBe(11);
  });

  it("does not add a note row when the diff is exactly the limit", () => {
    expect(previewRows(edit("", lines(10), { isNew: true }), 10)).toBe(10);
  });

  it("counts a command's lines the same way", () => {
    const command: ToolPreview = { kind: "command", command: "one\ntwo\nthree\nfour\nfive" };
    expect(previewRows(command, 12)).toBe(5);
    expect(previewRows(command, 3)).toBe(4);
  });

  it("treats a negative limit as zero lines shown, with the note", () => {
    expect(previewRows(edit("", "x", { isNew: true }), -5)).toBe(1);
  });
});
