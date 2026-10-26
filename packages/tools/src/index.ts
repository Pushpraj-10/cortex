/**
 * @cortex/tools — the tools an agent can execute, plus a registry to look them up by name.
 * Each tool declares what it does to the world (`kind`), so approval policy never needs to
 * know tool names.
 */

export type { ToolDefinition, ToolExecutionContext, ToolKind, ToolPreview } from "./types.js";
export { ToolError, argText, defineTool } from "./define-tool.js";
export { UnknownToolError, getTool, listTools, registerTool } from "./registry.js";
export { builtinTools } from "./builtin-tools.js";

export {
  copyFileTool,
  createDirectoryTool,
  deleteFileTool,
  editFileTool,
  fileExistsTool,
  getFileInfoTool,
  listDirectoryTool,
  moveFileTool,
  readFileTool,
  writeFileTool,
} from "./filesystem.js";
export { findFilesTool, searchFilesTool } from "./search.js";
export { runCommandTool, type RunCommandResult } from "./shell.js";
export {
  SECURITY_REPORT_DIR,
  SECURITY_REPORT_STAGES,
  isSecurityReportStage,
  saveSecurityReportTool,
  securityReportPath,
  type SecurityReportStage,
} from "./security.js";
