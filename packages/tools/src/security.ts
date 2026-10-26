/**
 * The security agents' hand-off report. Scan, suggest and fix each save one markdown report to
 * `.cortex/security/<stage>.md`, which the next agent reads with `read_file`. The caller picks a
 * stage, never a path, so the tool can only ever write those three files.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "@cortex/core";
import { defineTool } from "./define-tool.js";

export const SECURITY_REPORT_DIR = ".cortex/security";

/** Which agent a report comes from: the scan's findings, the suggested fixes, or the log of applied fixes. */
export const SECURITY_REPORT_STAGES = ["scan", "suggestions", "fixes"] as const;
export type SecurityReportStage = (typeof SECURITY_REPORT_STAGES)[number];

export const isSecurityReportStage = (value: unknown): value is SecurityReportStage =>
  SECURITY_REPORT_STAGES.includes(value as SecurityReportStage);

export const securityReportPath = (stage: SecurityReportStage) => `${SECURITY_REPORT_DIR}/${stage}.md`;

export const saveSecurityReportTool = defineTool<{ stage: SecurityReportStage; content: string }, { path: string }>({
  name: "save_security_report",
  description:
    `Save a security report for the next agent to read. Stages: scan (findings), suggestions (proposed fixes), ` +
    `fixes (changes applied). Overwrites the previous report for that stage. Written to ${SECURITY_REPORT_DIR}/<stage>.md.`,
  kind: "edit",
  parametersSchema: {
    type: "object",
    properties: {
      stage: { type: "string", enum: [...SECURITY_REPORT_STAGES], description: "Which report this is" },
      content: { type: "string", description: "The full report, in markdown" },
    },
    required: ["stage", "content"],
  },
  summarize: (args) => `Save ${isSecurityReportStage(args?.stage) ? args.stage : "?"} security report`,
  failure: (args) => `Failed to save the ${args.stage} security report`,
  async run(args, context) {
    if (!isSecurityReportStage(args.stage)) {
      throw new Error(`stage must be one of: ${SECURITY_REPORT_STAGES.join(", ")}`);
    }
    const relative = securityReportPath(args.stage);
    const resolved = resolveWorkspacePath(context.cwd, relative);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, args.content, "utf-8");
    return { path: relative };
  },
});
