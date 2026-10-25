import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { formatRelatedFiles, relatedFilesProvider } from "../../src/providers/related-files.js";

describe("formatRelatedFiles", () => {
  it("lists a file's imports and tests", () => {
    const result = formatRelatedFiles([
      { file: "src/a.ts", imports: ["src/b.ts", "src/c.ts"], tests: ["test/a.test.ts"] },
    ]);

    expect(result).toBe("src/a.ts\n  imports: src/b.ts, src/c.ts\n  tests: test/a.test.ts");
  });

  it("omits the line for a part that is empty", () => {
    expect(formatRelatedFiles([{ file: "a.ts", imports: ["b.ts"], tests: [] }])).toBe("a.ts\n  imports: b.ts");
    expect(formatRelatedFiles([{ file: "a.ts", imports: [], tests: ["a.test.ts"] }])).toBe("a.ts\n  tests: a.test.ts");
  });

  it("leaves out files with neither imports nor tests", () => {
    const result = formatRelatedFiles([
      { file: "empty.ts", imports: [], tests: [] },
      { file: "a.ts", imports: ["b.ts"], tests: [] },
    ]);
    expect(result).toBe("a.ts\n  imports: b.ts");
  });

  it("separates files with a blank line", () => {
    const result = formatRelatedFiles([
      { file: "a.ts", imports: ["x.ts"], tests: [] },
      { file: "b.ts", imports: ["y.ts"], tests: [] },
    ]);
    expect(result).toBe("a.ts\n  imports: x.ts\n\nb.ts\n  imports: y.ts");
  });

  it("caps a long import list and says how many were left off", () => {
    const imports = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    const result = formatRelatedFiles([{ file: "a.ts", imports, tests: [] }]);
    expect(result).toContain("f14.ts, … (5 more)");
    expect(result).not.toContain("f15.ts");
  });

  it("returns an empty string when there is nothing to say", () => {
    expect(formatRelatedFiles([])).toBe("");
    expect(formatRelatedFiles([{ file: "a.ts", imports: [], tests: [] }])).toBe("");
  });
});

describe("relatedFilesProvider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string, content = "x"): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  const request = (userMessage: string) => ({ workspaceRoot: tempDir, userMessage });

  it("applies only when the message looks like it names a file", async () => {
    expect(await relatedFilesProvider.applies?.(request("fix src/a.ts"))).toBe(true);
    expect(await relatedFilesProvider.applies?.(request("hello there"))).toBe(false);
  });

  it("reports the named file's local imports and tests as one mid-relevance fragment", async () => {
    await write("packages/p/src/a.ts", `import { b } from "./b.js";\nimport fs from "node:fs";\n`);
    await write("packages/p/src/b.ts");
    await write("packages/p/test/a.test.ts");

    const result = await relatedFilesProvider.gather(request("explain packages/p/src/a.ts"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        {
          providerId: "related-files",
          title: "Related files",
          content:
            "packages/p/src/a.ts\n  imports: packages/p/src/b.ts\n  tests: packages/p/test/a.test.ts",
          relevance: 0.5,
        },
      ]);
    }
  });

  it("returns no fragments when the named file has no local imports or tests", async () => {
    await write("lonely.ts", "export const x = 1;");

    const result = await relatedFilesProvider.gather(request("look at lonely.ts"));

    expect(result.ok && result.value).toEqual([]);
  });

  it("returns no fragments when the named file does not exist", async () => {
    const result = await relatedFilesProvider.gather(request("look at nope.ts"));
    expect(result.ok && result.value).toEqual([]);
  });

  it("ignores imports that don't resolve to a real file", async () => {
    await write("a.ts", `import { gone } from "./gone.js";\nimport { b } from "./b.js";`);
    await write("b.ts");

    const result = await relatedFilesProvider.gather(request("check a.ts"));

    expect(result.ok && result.value[0]?.content).toBe("a.ts\n  imports: b.ts");
  });
});
