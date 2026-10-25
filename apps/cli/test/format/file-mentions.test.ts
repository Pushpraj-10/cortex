import { describe, expect, it } from "vitest";
import { MAX_FILE_MATCHES, activeMention, completeMention, rankFiles } from "../../src/format/file-mentions.js";

describe("activeMention", () => {
  it("finds the @query that ends at the cursor", () => {
    expect(activeMention("see @src/a", 10)).toEqual({ start: 4, query: "src/a" });
    expect(activeMention("@", 1)).toEqual({ start: 0, query: "" });
    expect(activeMention("a @x @y", 7)).toEqual({ start: 5, query: "y" });
  });

  it("treats a line break as the whitespace before the @", () => {
    expect(activeMention("line1\n@fi", 9)).toEqual({ start: 6, query: "fi" });
  });

  it("looks only at the text before the cursor", () => {
    expect(activeMention("fix @sr and more", 7)).toEqual({ start: 4, query: "sr" });
    expect(activeMention("@abc def", 4)).toEqual({ start: 0, query: "abc" });
  });

  it("is not triggered once the cursor has left the word", () => {
    expect(activeMention("@abc def", 8)).toBeUndefined();
    expect(activeMention("no mention here", 15)).toBeUndefined();
  });

  it("ignores an @ inside a word, like an email address or a scoped package", () => {
    expect(activeMention("mail me@host.com", 16)).toBeUndefined();
    expect(activeMention("npm i x@1.2", 11)).toBeUndefined();
    expect(activeMention("@a@b", 4)).toBeUndefined();
  });
});

describe("completeMention", () => {
  it("replaces the @query with the plain path and a space, and puts the cursor after it", () => {
    expect(completeMention("fix @sr", 7, { start: 4, query: "sr" }, "src/a.ts")).toEqual({ value: "fix src/a.ts ", cursor: 13 });
  });

  it("uses the space that is already there instead of adding a second one", () => {
    expect(completeMention("fix @sr and more", 7, { start: 4, query: "sr" }, "src/a.ts")).toEqual({
      value: "fix src/a.ts and more",
      cursor: 13,
    });
  });

  it("adds no space before a line break", () => {
    expect(completeMention("@sr\nnext", 3, { start: 0, query: "sr" }, "a.ts")).toEqual({ value: "a.ts\nnext", cursor: 4 });
  });
});

describe("rankFiles", () => {
  const files = [
    "README.md",
    "package.json",
    "src/index.ts",
    "src/ui/App.tsx",
    "src/ui/components/InputBox.tsx",
    "packages/cli/src/index.ts",
    "docs/index.md",
    "test/ui/input-box.test.tsx",
  ];

  it("puts the shallowest files first when nothing is typed after the @", () => {
    expect(rankFiles(files, "", 4)).toEqual(["README.md", "package.json", "docs/index.md", "src/index.ts"]);
  });

  it("ranks names that start with the query by how short and shallow the path is", () => {
    expect(rankFiles(files, "index")).toEqual(["src/index.ts", "docs/index.md", "packages/cli/src/index.ts"]);
  });

  it("puts the exact file name before names that merely start with it", () => {
    const found = rankFiles(["lib/app.tsx", "src/app.ts", "app.ts.old"], "app.ts");
    expect(found).toEqual(["src/app.ts", "app.ts.old", "lib/app.tsx"]);
  });

  it("ranks a match in the file name above one in a folder name, whatever the lengths", () => {
    const found = rankFiles(["src/button/index.ts", "src/ui/my-button.ts", "src/ui/button.ts"], "button");
    expect(found).toEqual(["src/ui/button.ts", "src/ui/my-button.ts", "src/button/index.ts"]);
  });

  it("matches a query that spans folders, and one whose letters are only in order", () => {
    expect(rankFiles(files, "ui/app")).toEqual(["src/ui/App.tsx"]);
    const scattered = rankFiles(files, "uib");
    expect(scattered).toContain("src/ui/components/InputBox.tsx");
    expect(scattered).not.toContain("README.md");
  });

  it("prefers the tighter run of letters when they are only in order", () => {
    expect(rankFiles(["q12345z.ts", "q1z.ts"], "qz")).toEqual(["q1z.ts", "q12345z.ts"]);
  });

  it("ignores case", () => {
    expect(rankFiles(files, "READme")[0]).toBe("README.md");
    expect(rankFiles(files, "inputbox")[0]).toBe("src/ui/components/InputBox.tsx");
  });

  it("accepts a Windows-style separator in the query", () => {
    const backslash = String.fromCharCode(92);
    expect(rankFiles(files, `src${backslash}ui${backslash}app`)).toEqual(["src/ui/App.tsx"]);
  });

  it("finds nothing when the letters are not all there", () => {
    expect(rankFiles(files, "zzzz")).toEqual([]);
    expect(rankFiles([], "a")).toEqual([]);
  });

  it("breaks ties alphabetically", () => {
    expect(rankFiles(["b/x.ts", "a/x.ts"], "x.ts")).toEqual(["a/x.ts", "b/x.ts"]);
  });

  it("returns at most the limit, eight by default, and leaves its input alone", () => {
    const many = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    const copy = [...many];
    expect(rankFiles(many, "f")).toHaveLength(MAX_FILE_MATCHES);
    expect(MAX_FILE_MATCHES).toBe(8);
    expect(rankFiles(many, "f", 3)).toHaveLength(3);
    expect(rankFiles(many, "", 5)).toHaveLength(5);
    expect(many).toEqual(copy);
  });
});
