import React from "react";
import { describe, expect, it } from "vitest";
import { ToolCall } from "../../../src/ui/toolcalls/ToolCall.js";
import type { ToolCallEntry } from "../../../src/ui/types.js";
import { renderFrame } from "../support/render-frame.js";

const entry = (patch: Partial<ToolCallEntry> = {}): ToolCallEntry => ({
  kind: "toolCall",
  id: "t1",
  summary: "Edit a.ts",
  toolKind: "edit",
  status: "success",
  startedAt: 0,
  detail: "",
  ...patch,
});

const lines = (count: number) => Array.from({ length: count }, (_, i) => `line${i + 1}`).join("\n");
const frame = async (value: ToolCallEntry, expanded = false, width = 80) => (await renderFrame(<ToolCall entry={value} expanded={expanded} width={width} />, width)).split("\n");

describe("ToolCall header", () => {
  it("shows a tick, the summary, what changed and how long it took", async () => {
    const preview = { kind: "diff" as const, path: "a.ts", before: "a\nb\nc", after: "a\nB\nc", startLine: 1 };
    const [header] = await frame(entry({ preview, durationMs: 1200 }));
    expect(header).toBe("✓ Edit a.ts (+1 -1) · 1.2s");
  });

  it("marks a new file, and leaves out the duration of an instant call", async () => {
    const preview = { kind: "diff" as const, path: "n.ts", before: "", after: "x\ny\nz", startLine: 1, isNew: true };
    const [header] = await frame(entry({ summary: "Write n.ts", preview, durationMs: 40 }));
    expect(header).toBe("✓ Write n.ts (new, +3)");
  });

  it("shows a spinner while the call runs and a question mark while it waits for approval", async () => {
    expect((await frame(entry({ status: "running" })))[0]).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Edit a\.ts$/);
    expect((await frame(entry({ status: "awaiting" })))[0]).toBe("? Edit a.ts");
  });

  it("shows a cross for an error, and a barred circle for a declined or interrupted call", async () => {
    expect((await frame(entry({ status: "error", error: "boom" })))[0]).toBe("✗ Edit a.ts");
    expect((await frame(entry({ status: "declined", error: "No." })))[0]).toBe("⊘ Edit a.ts");
    expect((await frame(entry({ status: "cancelled", error: "Interrupted" })))[0]).toBe("⊘ Edit a.ts");
  });
});

describe("ToolCall body: file changes", () => {
  const preview = { kind: "diff" as const, path: "a.ts", before: "a\nb\nc", after: "a\nB\nc", startLine: 1 };

  it("shows the diff with line numbers, signs and context, indented under the header", async () => {
    expect(await frame(entry({ preview }))).toEqual(["✓ Edit a.ts (+1 -1)", "  1   a", "  2 - b", "  2 + B", "  3   c"]);
  });

  it("shows the diff while the call is running or waiting, so it is visible before the answer", async () => {
    expect((await frame(entry({ status: "running", preview }))).join("\n")).toContain("2 + B");
    expect((await frame(entry({ status: "awaiting", preview }))).join("\n")).toContain("2 + B");
  });

  it("does not show the diff of a change that did not happen, and says why instead", async () => {
    const declined = (await frame(entry({ status: "declined", preview, error: "The user declined this tool call." }))).join("\n");
    expect(declined).not.toContain("2 + B");
    expect(declined).toContain("↳ The user declined this tool call.");

    const failed = (await frame(entry({ status: "error", preview, error: "oldString was not found in the file" }))).join("\n");
    expect(failed).not.toContain("2 + B");
    expect(failed).toContain("↳ oldString was not found in the file");

    expect((await frame(entry({ status: "cancelled", preview, error: "Interrupted" }))).join("\n")).toContain("↳ Interrupted");
  });

  it("does not claim changed-line counts in the header of a change that did not happen", async () => {
    for (const status of ["declined", "error", "cancelled"] as const) {
      expect((await frame(entry({ status, preview, error: "no" })))[0]).toBe(status === "error" ? "✗ Edit a.ts" : "⊘ Edit a.ts");
    }
  });

  it("cuts a long diff at twelve lines and says how many were left, until it is expanded", async () => {
    const big = { kind: "diff" as const, path: "n.ts", before: "", after: lines(30), startLine: 1, isNew: true };
    const collapsed = await frame(entry({ preview: big }));
    expect(collapsed).toHaveLength(1 + 12 + 1);
    expect(collapsed[collapsed.length - 1]).toBe("  … 18 more lines (ctrl+t to expand)");

    const expanded = await frame(entry({ preview: big }), true);
    expect(expanded).toHaveLength(1 + 30);
    expect(expanded.join("\n")).not.toContain("more line");
  });

  it("collapses far-away unchanged lines into a gap", async () => {
    const wide = { kind: "diff" as const, path: "a.ts", before: lines(30), after: lines(30).replace("line15", "X"), startLine: 1 };
    const rows = (await frame(entry({ preview: wide }))).join("\n");
    expect(rows).toContain("⋯ 12 unchanged lines");
    expect(rows).toContain("⋯ 13 unchanged lines");
  });
});

describe("ToolCall body: commands and other calls", () => {
  it("shows the last lines of a command's output, and the rest when expanded", async () => {
    const run = entry({ summary: "Run npm test", toolKind: "execute", detail: lines(20) });
    const collapsed = await frame(run);
    expect(collapsed[1]).toBe("  … 12 earlier lines (ctrl+t to expand)");
    expect(collapsed.slice(2)).toEqual(Array.from({ length: 8 }, (_, i) => `  line${13 + i}`));
    expect(await frame(run, true)).toHaveLength(1 + 20);
  });

  it("shows nothing under a finished read call until it is expanded, then its result in a box", async () => {
    const read = entry({ summary: "Read a.ts", toolKind: "read", detail: '{ "content": "x" }' });
    expect(await frame(read)).toEqual(["✓ Read a.ts"]);
    const expanded = (await frame(read, true)).join("\n");
    expect(expanded).toContain("╭");
    expect(expanded).toContain('{ "content": "x" }');
  });

  it("shows no body for a call that has not produced anything yet", async () => {
    expect(await frame(entry({ summary: "Run ls", toolKind: "execute", status: "running" }))).toHaveLength(1);
  });
});
