import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { formatMentionedFile, mentionedFilesProvider } from "../../src/providers/mentioned-files.js";

describe("formatMentionedFile", () => {
  it("titles the section with the file path and fences the excerpt", () => {
    expect(formatMentionedFile("src/a.ts", "const a = 1;")).toEqual({
      title: "File: src/a.ts",
      content: "```\nconst a = 1;\n```",
    });
  });

  it("uses a longer fence when the file itself contains a code fence", () => {
    const { content } = formatMentionedFile("README.md", "intro\n```ts\nx\n```\n");
    expect(content.startsWith("````\n")).toBe(true);
    expect(content.endsWith("\n````")).toBe(true);
  });
});

describe("mentionedFilesProvider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function write(relativePath: string, content: string): Promise<void> {
    const full = path.join(tempDir, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }

  const request = (userMessage: string) => ({ workspaceRoot: tempDir, userMessage });

  it("applies only when the message looks like it names a file", async () => {
    expect(await mentionedFilesProvider.applies?.(request("fix src/a.ts"))).toBe(true);
    expect(await mentionedFilesProvider.applies?.(request("hello there"))).toBe(false);
  });

  it("attaches each named file at top relevance", async () => {
    await write("src/a.ts", "export const a = 1;");
    await write("src/b.ts", "export const b = 2;");

    const result = await mentionedFilesProvider.gather(request("compare src/a.ts and b.ts"));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((f) => f.title)).toEqual(["File: src/a.ts", "File: src/b.ts"]);
      expect(result.value[0]?.content).toContain("export const a = 1;");
      expect(result.value.every((f) => f.relevance === 1 && f.providerId === "mentioned-files")).toBe(true);
    }
  });

  it("returns no fragments when the named file does not exist", async () => {
    const result = await mentionedFilesProvider.gather(request("fix missing.ts"));
    expect(result.ok && result.value).toEqual([]);
  });

  it("skips an unreadable (binary) file but keeps the others", async () => {
    await fs.writeFile(path.join(tempDir, "blob.json"), Buffer.from([0x00, 0x01]));
    await write("ok.ts", "fine");

    const result = await mentionedFilesProvider.gather(request("look at blob.json and ok.ts"));

    expect(result.ok && result.value.map((f) => f.title)).toEqual(["File: ok.ts"]);
  });

  it("truncates a very large file instead of attaching all of it", async () => {
    await write("big.ts", "x".repeat(20_000));

    const result = await mentionedFilesProvider.gather(request("read big.ts"));

    expect(result.ok && result.value[0]?.content.length).toBeLessThan(5000);
  });
});
