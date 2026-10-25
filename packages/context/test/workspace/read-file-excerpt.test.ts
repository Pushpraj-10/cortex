import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileExcerpt } from "../../src/workspace/read-file-excerpt.js";

describe("readFileExcerpt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("returns the whole file when it fits", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "const a = 1;\n");

    const result = await readFileExcerpt(tempDir, "a.ts");

    expect(result.ok && result.value).toBe("const a = 1;\n");
  });

  it("truncates a long file and says so", async () => {
    await fs.writeFile(path.join(tempDir, "big.ts"), "x".repeat(100));

    const result = await readFileExcerpt(tempDir, "big.ts", 10);

    expect(result.ok && result.value).toBe("x".repeat(10) + "\n… [file truncated]");
  });

  it("returns an error Result for a missing file", async () => {
    const result = await readFileExcerpt(tempDir, "missing.ts");
    expect(result.ok).toBe(false);
  });

  it("returns an error Result for a path outside the workspace", async () => {
    const result = await readFileExcerpt(tempDir, "../secret.txt");
    expect(result.ok).toBe(false);
  });

  it("returns an error Result for a binary file", async () => {
    await fs.writeFile(path.join(tempDir, "image.bin"), Buffer.from([0x89, 0x00, 0x01]));

    const result = await readFileExcerpt(tempDir, "image.bin");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("binary");
  });
});
