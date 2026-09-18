import { describe, expect, it } from "vitest";
import { reviewAnalysisTemplate } from "../../src/templates/reviewAnalysis.js";

const vars = {
  ruleId: "sql-injection",
  file: "src/db.ts",
  rawMessage: "possible SQLi",
  snippet: "query(sql)",
};

describe("reviewAnalysisTemplate", () => {
  it("has the expected id", () => {
    expect(reviewAnalysisTemplate.id).toBe("review-analysis");
  });

  it("interpolates all provided vars", () => {
    const rendered = reviewAnalysisTemplate.render(vars);
    expect(rendered).toContain("sql-injection");
    expect(rendered).toContain("src/db.ts");
    expect(rendered).toContain("possible SQLi");
    expect(rendered).toContain("query(sql)");
  });

  it("asks for a JSON response shaped like SecurityAnalysis", () => {
    const rendered = reviewAnalysisTemplate.render(vars);
    expect(rendered).toContain('"confirmed"');
    expect(rendered).toContain('"confidence"');
    expect(rendered).toContain('"rootCause"');
    expect(rendered).toContain('"recommendation"');
  });

  it("throws when a required var is missing", () => {
    expect(() => reviewAnalysisTemplate.render({ ruleId: "x" })).toThrow();
  });
});
