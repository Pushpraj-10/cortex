import {
  registerTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirectoryTool,
  createDirectoryTool,
  moveFileTool,
  copyFileTool,
  fileExistsTool,
  getFileInfoTool,
} from "@cortex/tools";

const fileSystemTools = [
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirectoryTool,
  createDirectoryTool,
  moveFileTool,
  copyFileTool,
  fileExistsTool,
  getFileInfoTool,
];

/** Registers every file-system tool this CLI can use. Call once, at startup. */
export function registerFileSystemTools(): void {
  for (const tool of fileSystemTools) registerTool(tool);
}
