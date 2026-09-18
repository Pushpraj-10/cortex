import { describe, expect, it } from "vitest";
import { formatOverview } from "../../../src/providers/workspace-overview/format-overview.js";

describe("formatOverview", () => {
  it("renders package name and description when present", () => {
    const result = formatOverview({ entries: [], packageInfo: { name: "my-project", description: "does things" } });
    expect(result).toContain("Project: my-project — does things");
  });

  it("renders package name without a trailing dash when there is no description", () => {
    const result = formatOverview({ entries: [], packageInfo: { name: "my-project" } });
    expect(result).toContain("Project: my-project");
    expect(result).not.toContain("—");
  });

  it("omits the project line entirely when there is no packageInfo", () => {
    const result = formatOverview({ entries: [] });
    expect(result).not.toContain("Project:");
  });

  it("renders a bulleted directory listing, marking directories with a trailing slash", () => {
    const result = formatOverview({
      entries: [
        { name: "src", type: "directory" },
        { name: "package.json", type: "file" },
      ],
    });
    expect(result).toContain("- src/");
    expect(result).toContain("- package.json");
  });

  it("omits the directory listing section when there are no entries", () => {
    const result = formatOverview({ entries: [] });
    expect(result).not.toContain("Top-level contents:");
  });

  it("renders a README excerpt when present", () => {
    const result = formatOverview({ entries: [], readmeExcerpt: "This project does X." });
    expect(result).toContain("README excerpt:\nThis project does X.");
  });

  it("omits the README section when absent", () => {
    const result = formatOverview({ entries: [] });
    expect(result).not.toContain("README excerpt:");
  });

  it("returns an empty string when there is nothing to report", () => {
    expect(formatOverview({ entries: [] })).toBe("");
  });
});
