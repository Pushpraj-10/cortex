import { describe, expect, it } from "vitest";
import { parseSkill } from "../../src/skills/parse-skill";

describe("parseSkill", () => {
  it("reads frontmatter and body", () => {
    const s = parseSkill("---\nname: review\ndescription: \"Reviews diffs\"\n---\n\nDo the review.\n", "fallback");
    expect(s).toEqual({ name: "review", description: "Reviews diffs", body: "Do the review." });
  });

  it("falls back to the directory name without frontmatter", () => {
    expect(parseSkill("just text", "dir")).toEqual({ name: "dir", description: "", body: "just text" });
  });
});
