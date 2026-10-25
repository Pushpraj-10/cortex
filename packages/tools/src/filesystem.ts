/**
 * The file-system tools. Every path argument is resolved through resolveWorkspacePath, so a
 * tool can never read or write outside the workspace root. Grouped by what they do to the
 * workspace: the first four only read; the rest change it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "@cortex/core";
import { argText, defineTool } from "./define-tool.js";

const pathSchema = (description: string) => ({
  type: "object",
  properties: { path: { type: "string", description } },
  required: ["path"],
});

const fromToSchema = {
  type: "object",
  properties: {
    from: { type: "string", description: "Source path (relative to workspace root)" },
    to: { type: "string", description: "Destination path (relative to workspace root)" },
  },
  required: ["from", "to"],
};

interface PathArgs {
  path: string;
}

interface FromToArgs {
  from: string;
  to: string;
}

// ---- read-only -------------------------------------------------------------------

export const readFileTool = defineTool<PathArgs, { content: string }>({
  name: "read_file",
  description: "Read the full contents of a file",
  kind: "read",
  parametersSchema: pathSchema("Path to the file (relative to workspace root)"),
  summarize: (args) => `Read ${argText(args?.path)}`,
  failure: (args) => `Failed to read file at ${args.path}`,
  async run(args, context) {
    return { content: await fs.readFile(resolveWorkspacePath(context.cwd, args.path), "utf-8") };
  },
});

export const listDirectoryTool = defineTool<PathArgs, { entries: { name: string; type: "file" | "directory" }[] }>({
  name: "list_directory",
  description: "List files and subdirectories in a directory",
  kind: "read",
  parametersSchema: pathSchema("Path to the directory (relative to workspace root)"),
  summarize: (args) => `List ${argText(args?.path)}`,
  failure: (args) => `Failed to list directory at ${args.path}`,
  async run(args, context) {
    const entries = await fs.readdir(resolveWorkspacePath(context.cwd, args.path), { withFileTypes: true });
    return {
      entries: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
      })),
    };
  },
});

export const fileExistsTool = defineTool<PathArgs, { exists: boolean }>({
  name: "file_exists",
  description: "Check whether a file or directory exists",
  kind: "read",
  parametersSchema: pathSchema("Path to check (relative to workspace root)"),
  summarize: (args) => `Check ${argText(args?.path)} exists`,
  failure: (args) => `Failed to check ${args.path}`,
  async run(args, context) {
    // A missing path and a path outside the workspace both mean "not there" — neither is an error.
    try {
      await fs.access(resolveWorkspacePath(context.cwd, args.path));
      return { exists: true };
    } catch {
      return { exists: false };
    }
  },
});

export const getFileInfoTool = defineTool<
  PathArgs,
  { size: number; isDirectory: boolean; isFile: boolean; modified: string; created: string }
>({
  name: "get_file_info",
  description: "Get file metadata like size, timestamps, and type",
  kind: "read",
  parametersSchema: pathSchema("Path to the file (relative to workspace root)"),
  summarize: (args) => `Get info for ${argText(args?.path)}`,
  failure: (args) => `Failed to get file info for ${args.path}`,
  async run(args, context) {
    const stats = await fs.stat(resolveWorkspacePath(context.cwd, args.path));
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString(),
    };
  },
});

// ---- editing ---------------------------------------------------------------------

export const writeFileTool = defineTool<{ path: string; content: string }, { success: boolean }>({
  name: "write_file",
  description: "Create or overwrite a file with the given content",
  kind: "edit",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
      content: { type: "string", description: "File contents" },
    },
    required: ["path", "content"],
  },
  summarize: (args) => `Write ${argText(args?.path)}`,
  failure: (args) => `Failed to write file at ${args.path}`,
  async run(args, context) {
    const resolved = resolveWorkspacePath(context.cwd, args.path);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, args.content, "utf-8");
    return { success: true };
  },
});

export const editFileTool = defineTool<
  { path: string; oldString: string; newString: string },
  { success: boolean; applied: boolean }
>({
  name: "edit_file",
  description: "Apply a targeted modification to a file by replacing a string",
  kind: "edit",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file (relative to workspace root)" },
      oldString: { type: "string", description: "The exact string to find and replace" },
      newString: { type: "string", description: "The replacement string" },
    },
    required: ["path", "oldString", "newString"],
  },
  summarize: (args) => `Edit ${argText(args?.path)}`,
  failure: (args) => `Failed to edit file at ${args.path}`,
  async run(args, context) {
    const resolved = resolveWorkspacePath(context.cwd, args.path);
    const content = await fs.readFile(resolved, "utf-8");
    // A miss is a failure the model must see: silently reporting "applied: false" invites it to
    // claim success. Only the first occurrence is replaced.
    if (!content.includes(args.oldString)) throw new Error("oldString was not found in the file");
    await fs.writeFile(resolved, content.replace(args.oldString, args.newString), "utf-8");
    return { success: true, applied: true };
  },
});

export const createDirectoryTool = defineTool<PathArgs, { success: boolean }>({
  name: "create_directory",
  description: "Create a directory (including parent directories if needed)",
  kind: "edit",
  parametersSchema: pathSchema("Path to the directory (relative to workspace root)"),
  summarize: (args) => `Create directory ${argText(args?.path)}`,
  failure: (args) => `Failed to create directory at ${args.path}`,
  async run(args, context) {
    await fs.mkdir(resolveWorkspacePath(context.cwd, args.path), { recursive: true });
    return { success: true };
  },
});

export const copyFileTool = defineTool<FromToArgs, { success: boolean }>({
  name: "copy_file",
  description: "Copy a file to a new location",
  kind: "edit",
  parametersSchema: fromToSchema,
  summarize: (args) => `Copy ${argText(args?.from)} → ${argText(args?.to)}`,
  failure: (args) => `Failed to copy file from ${args.from} to ${args.to}`,
  async run(args, context) {
    const from = resolveWorkspacePath(context.cwd, args.from);
    const to = resolveWorkspacePath(context.cwd, args.to);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    return { success: true };
  },
});

export const moveFileTool = defineTool<FromToArgs, { success: boolean }>({
  name: "move_file",
  description: "Move or rename a file",
  kind: "edit",
  parametersSchema: fromToSchema,
  summarize: (args) => `Move ${argText(args?.from)} → ${argText(args?.to)}`,
  failure: (args) => `Failed to move file from ${args.from} to ${args.to}`,
  async run(args, context) {
    const from = resolveWorkspacePath(context.cwd, args.from);
    const to = resolveWorkspacePath(context.cwd, args.to);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.rename(from, to);
    return { success: true };
  },
});

export const deleteFileTool = defineTool<PathArgs, { success: boolean }>({
  name: "delete_file",
  description: "Delete a file",
  kind: "edit",
  parametersSchema: pathSchema("Path to the file (relative to workspace root)"),
  summarize: (args) => `Delete ${argText(args?.path)}`,
  failure: (args) => `Failed to delete file at ${args.path}`,
  async run(args, context) {
    await fs.unlink(resolveWorkspacePath(context.cwd, args.path));
    return { success: true };
  },
});
