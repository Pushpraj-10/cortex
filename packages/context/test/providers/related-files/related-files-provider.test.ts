import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { relatedFilesProvider } from "../../../src/providers/related-files/related-files-provider.js";

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
