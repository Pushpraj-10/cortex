import { describe, expect, it } from "vitest";
import { formatMentionedFile } from "../../../src/providers/mentioned-files/format-mentioned-file.js";

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
