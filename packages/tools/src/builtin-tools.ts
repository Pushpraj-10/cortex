import {
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
import { findFilesTool, searchFilesTool } from "./search.js";
import { saveSecurityReportTool } from "./security.js";
import { runCommandTool } from "./shell.js";
import type { ToolDefinition } from "./types.js";

/** Every tool this package ships. The composition root registers the ones it wants active. */
export const builtinTools: ToolDefinition[] = [
  readFileTool,
  listDirectoryTool,
  fileExistsTool,
  getFileInfoTool,
  findFilesTool,
  searchFilesTool,
  writeFileTool,
  editFileTool,
  createDirectoryTool,
  copyFileTool,
  moveFileTool,
  deleteFileTool,
  runCommandTool,
  saveSecurityReportTool,
] as ToolDefinition[];
