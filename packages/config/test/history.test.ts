import { mkdtempSync, rmSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_HISTORY_ENTRIES, MAX_HISTORY_ENTRY_CHARS, appendHistory, historyPath, loadHistory } from "../src/history.js";

let home: string;
const project = path.join(tmpdir(), "some-project");

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "cortex-history-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("historyPath", () => {
  it("is a file of its own per project, under ~/.cortex/history", () => {
    const here = historyPath(project, home);
    expect(path.dirname(here)).toBe(path.join(home, ".cortex", "history"));
    expect(here.endsWith(".jsonl")).toBe(true);
    expect(historyPath(path.join(tmpdir(), "other-project"), home)).not.toBe(here);
    expect(historyPath(project, home)).toBe(here);
  });

  it("does not put the project's folder name in the file name", () => {
    expect(path.basename(historyPath(path.join(tmpdir(), "secret-client-name"), home))).not.toContain("secret");
  });
});

describe("loadHistory", () => {
  it("is empty when nothing was saved", async () => {
    expect(await loadHistory(project, home)).toEqual([]);
  });

  it("returns what was appended, oldest first, multi-line and unicode messages intact", async () => {
    await appendHistory(project, "fix the parser", home);
    await appendHistory(project, "line one\nline two\n\nline four", home);
    await appendHistory(project, 'quotes "and" \\ backslash — héllo ✓ 世界', home);
    expect(await loadHistory(project, home)).toEqual([
      "fix the parser",
      "line one\nline two\n\nline four",
      'quotes "and" \\ backslash — héllo ✓ 世界',
    ]);
  });

  it("keeps each project's history apart", async () => {
    await appendHistory(project, "in the first", home);
    await appendHistory(path.join(tmpdir(), "other-project"), "in the second", home);
    expect(await loadHistory(project, home)).toEqual(["in the first"]);
    expect(await loadHistory(path.join(tmpdir(), "other-project"), home)).toEqual(["in the second"]);
  });

  it("skips a damaged line and keeps the rest", async () => {
    await appendHistory(project, "before", home);
    await fs.appendFile(historyPath(project, home), '{not json\n42\n""\n   \n');
    await appendHistory(project, "after", home);
    expect(await loadHistory(project, home)).toEqual(["before", "after"]);
  });

  it("returns only the newest entries when there are more than the limit", async () => {
    const lines = Array.from({ length: MAX_HISTORY_ENTRIES + 20 }, (_, i) => JSON.stringify(`message ${i}`));
    await fs.mkdir(path.dirname(historyPath(project, home)), { recursive: true });
    await fs.writeFile(historyPath(project, home), `${lines.join("\n")}\n`);
    const loaded = await loadHistory(project, home);
    expect(loaded).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(loaded[0]).toBe("message 20");
    expect(loaded.at(-1)).toBe(`message ${MAX_HISTORY_ENTRIES + 19}`);
  });

  it("is empty rather than throwing when the history cannot be read", async () => {
    await fs.mkdir(historyPath(project, home), { recursive: true }); // a folder where the file should be
    expect(await loadHistory(project, home)).toEqual([]);
  });
});

describe("appendHistory", () => {
  it("ignores blank text and text too long to be worth recalling", async () => {
    await appendHistory(project, "", home);
    await appendHistory(project, "  \n ", home);
    await appendHistory(project, "x".repeat(MAX_HISTORY_ENTRY_CHARS + 1), home);
    expect(await loadHistory(project, home)).toEqual([]);
    await appendHistory(project, "x".repeat(MAX_HISTORY_ENTRY_CHARS), home);
    expect(await loadHistory(project, home)).toHaveLength(1);
  });

  it("creates the folder, and writes the file owner-only where permissions are enforced", async () => {
    await appendHistory(project, "hello", home);
    if (process.platform !== "win32") {
      expect(statSync(historyPath(project, home)).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(historyPath(project, home))).mode & 0o777).toBe(0o700);
    }
    expect(await loadHistory(project, home)).toEqual(["hello"]);
  });

  it("rewrites the file with the newest entries once it grows past its size limit, so it cannot grow without bound", async () => {
    const message = (i: number) => `message ${i} ${"x".repeat(300)}`;
    for (let i = 0; i < 1200; i += 1) await appendHistory(project, message(i), home);

    const size = statSync(historyPath(project, home)).size;
    expect(size).toBeLessThan(300 * 1024);
    const loaded = await loadHistory(project, home);
    expect(loaded).toHaveLength(MAX_HISTORY_ENTRIES);
    expect(loaded.at(-1)).toBe(message(1199));
  }, 30_000); // 1200 sequential file writes: quick alone, but over the default 5s when every test file runs at once

  it("rejects when the file cannot be written, for the caller to catch", async () => {
    await fs.mkdir(path.dirname(historyPath(project, home)), { recursive: true });
    await fs.mkdir(historyPath(project, home)); // a folder where the file should be
    await expect(appendHistory(project, "hello", home)).rejects.toThrow();
  });
});
