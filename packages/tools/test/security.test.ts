import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isSecurityReportStage, saveSecurityReportTool, securityReportPath } from "../src/security.js";
import type { ToolExecutionContext } from "../src/types.js";

describe("saveSecurityReportTool", () => {
  let tempDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(process.cwd(), "test-"));
    context = { cwd: tempDir };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    expect(saveSecurityReportTool.name).toBe("save_security_report");
    expect(saveSecurityReportTool.kind).toBe("edit");
    expect(saveSecurityReportTool.parametersSchema).toHaveProperty("properties.stage.enum", ["scan", "suggestions", "fixes"]);
  });

  it("writes each stage to its own file, creating the directory", async () => {
    for (const stage of ["scan", "suggestions", "fixes"] as const) {
      const result = await saveSecurityReportTool.handler({ stage, content: `# ${stage}` }, context);
      expect(result).toEqual({ ok: true, value: { path: `.cortex/security/${stage}.md` } });
      expect(await fs.readFile(path.join(tempDir, ".cortex", "security", `${stage}.md`), "utf-8")).toBe(`# ${stage}`);
    }
  });

  it("overwrites the previous report for a stage", async () => {
    await saveSecurityReportTool.handler({ stage: "scan", content: "old" }, context);
    await saveSecurityReportTool.handler({ stage: "scan", content: "new" }, context);
    expect(await fs.readFile(path.join(tempDir, securityReportPath("scan")), "utf-8")).toBe("new");
  });

  it("rejects a stage that is not one of the three, so it can never choose a path", async () => {
    const result = await saveSecurityReportTool.handler({ stage: "../../evil" as never, content: "x" }, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("stage must be one of: scan, suggestions, fixes");
    await expect(fs.access(path.join(tempDir, ".cortex"))).rejects.toThrow();
  });

  it("summarizes calls and tolerates missing args", () => {
    expect(saveSecurityReportTool.summarize!({ stage: "scan", content: "" })).toBe("Save scan security report");
    expect(saveSecurityReportTool.summarize!({} as never)).toBe("Save ? security report");
    expect(saveSecurityReportTool.summarize!(undefined as never)).toBe("Save ? security report");
  });

  it("guards stages with isSecurityReportStage", () => {
    expect(isSecurityReportStage("fixes")).toBe(true);
    expect(isSecurityReportStage("other")).toBe(false);
  });
});
