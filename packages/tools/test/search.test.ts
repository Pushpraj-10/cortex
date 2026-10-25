import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { findFilesTool, globToRegex, searchFilesTool } from "../src/search.js";
import type { ToolExecutionContext } from "../src/types.js";

describe("globToRegex", () => {
  it("handles ** across directories, including zero", () => {
    const re = globToRegex("src/**/*.ts");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/x/y/a.ts")).toBe(true);
    expect(re.test("lib/a.ts")).toBe(false);
  });

  it("* does not cross slashes and dots are literal", () => {
    expect(globToRegex("*.ts").test("a/b.ts")).toBe(false);
    expect(globToRegex("a.ts").test("aXts")).toBe(false);
  });
});

describe("search tools", () => {
  let tempDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    context = { cwd: tempDir };
    await fs.mkdir(path.join(tempDir, "src/deep"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "node_modules/pkg"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src/a.ts"), "const alpha = 1;\nconst Beta = 2;\n");
    await fs.writeFile(path.join(tempDir, "src/deep/b.ts"), "export const alpha = 3;\n");
    await fs.writeFile(path.join(tempDir, "src/c.md"), "alpha in docs\n");
    await fs.writeFile(path.join(tempDir, "node_modules/pkg/x.ts"), "alpha vendored\n");
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("find_files returns sorted matches and skips node_modules", async () => {
    const result = await findFilesTool.handler({ pattern: "**/*.ts" }, context);
    expect(result).toEqual({ ok: true, value: { files: ["src/a.ts", "src/deep/b.ts"] } });
  });

  it("find_files can search a subdirectory", async () => {
    const result = await findFilesTool.handler({ pattern: "*.ts", path: "src" }, context);
    expect(result).toEqual({ ok: true, value: { files: ["a.ts"] } });
  });

  it("search_files reports file, line and text for each match", async () => {
    const result = await searchFilesTool.handler({ pattern: "alpha", glob: "*.ts" }, context);
    expect(result).toEqual({
      ok: true,
      value: {
        matches: [
          { file: "src/a.ts", line: 1, text: "const alpha = 1;" },
          { file: "src/deep/b.ts", line: 1, text: "export const alpha = 3;" },
        ],
        truncated: false,
      },
    });
  });

  it("search_files honours caseInsensitive", async () => {
    const sensitive = await searchFilesTool.handler({ pattern: "beta" }, context);
    const insensitive = await searchFilesTool.handler({ pattern: "beta", caseInsensitive: true }, context);
    expect(sensitive.ok && sensitive.value.matches).toEqual([]);
    expect(insensitive.ok && insensitive.value.matches).toHaveLength(1);
  });

  it("search_files returns an error for an invalid regular expression", async () => {
    const result = await searchFilesTool.handler({ pattern: "(" }, context);
    expect(result.ok).toBe(false);
  });

  it("rejects a search root outside the workspace", async () => {
    expect((await findFilesTool.handler({ pattern: "*", path: ".." }, context)).ok).toBe(false);
    expect((await searchFilesTool.handler({ pattern: "x", path: ".." }, context)).ok).toBe(false);
  });
});
