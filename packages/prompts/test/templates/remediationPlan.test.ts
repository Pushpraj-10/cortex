import { describe, expect, it } from "vitest";
import { remediationPlanTemplate } from "../../src/templates/remediationPlan.js";

const vars = {
  title: "SQL Injection",
  file: "src/db.ts",
  description: "Raw string concatenation into a SQL query.",
  recommendation: "Use a parameterized query.",
  snippet: "db.query(`SELECT * FROM users WHERE id = ${id}`)",
};

describe("remediationPlanTemplate", () => {
  it("has the expected id", () => {
    expect(remediationPlanTemplate.id).toBe("remediation-plan");
  });

  it("interpolates all provided vars", () => {
    const rendered = remediationPlanTemplate.render(vars);
    expect(rendered).toContain("SQL Injection");
    expect(rendered).toContain("src/db.ts");
    expect(rendered).toContain("parameterized query");
    expect(rendered).toContain("SELECT * FROM users");
  });

  it("asks for a JSON response shaped like a RemediationPlan", () => {
    const rendered = remediationPlanTemplate.render(vars);
    expect(rendered).toContain('"summary"');
    expect(rendered).toContain('"changes"');
    expect(rendered).toContain('"expectedOutcome"');
  });

  it("instructs the model to make the minimum necessary change", () => {
    expect(remediationPlanTemplate.render(vars)).toContain("minimum necessary change");
  });
});
