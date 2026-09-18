/**
 * @cortex/tools — a registry of tools the agent can execute.
 * Each tool is a self-contained file operation with clear input/output contracts.
 */

// Shared types
export type { ToolDefinition, ToolExecutionContext } from "./types.js";

// Core registry
export { registerTool, getTool, listTools, UnknownToolError } from "./core/tool-registry.js";

// File system tools
export { readFileTool } from "./file-system/read-file.js";
export { writeFileTool } from "./file-system/write-file.js";
export { editFileTool } from "./file-system/edit-file.js";
export { deleteFileTool } from "./file-system/delete-file.js";
export { listDirectoryTool } from "./file-system/list-directory.js";
export { createDirectoryTool } from "./file-system/create-directory.js";
export { moveFileTool } from "./file-system/move-file.js";
export { copyFileTool } from "./file-system/copy-file.js";
export { fileExistsTool } from "./file-system/file-exists.js";
export { getFileInfoTool } from "./file-system/get-file-info.js";
