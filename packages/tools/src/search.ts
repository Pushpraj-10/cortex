/**
 * Search tools: find files by glob and search file contents by regex. Both are read-only and
 * stay inside the workspace; they skip dependency and build folders.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "@cortex/core";
import { argText, defineTool } from "./define-tool.js";

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist"]);
const MAX_MATCHES = 250;

/** Yields file paths relative to `root` (forward slashes), skipping vendored and build directories. */
async function* walkFiles(root: string, dir = root): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(root, full);
    else yield path.relative(root, full).split(path.sep).join("/");
  }
}

/** Supports `**`, `*` and `?`. `**` followed by `/` matches zero or more directories. */
export function globToRegex(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

export const findFilesTool = defineTool<{ pattern: string; path?: string }, { files: string[] }>({
  name: "find_files",
  description: "Find files by glob pattern (e.g. `src/**/*.ts`). Paths are relative to the search root.",
  kind: "read",
  parametersSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern" },
      path: { type: "string", description: "Directory to search (relative to workspace root; default: the root)" },
    },
    required: ["pattern"],
  },
  summarize: (args) => `Find ${argText(args?.pattern)}`,
  failure: (args) => `Failed to find files matching ${args.pattern}`,
  async run(args, context) {
    const root = resolveWorkspacePath(context.cwd, args.path ?? ".");
    const matcher = globToRegex(args.pattern);
    const files: string[] = [];
    for await (const file of walkFiles(root)) if (matcher.test(file)) files.push(file);
    return { files: files.sort() };
  },
});

export const searchFilesTool = defineTool<
  { pattern: string; path?: string; glob?: string; caseInsensitive?: boolean },
  { matches: { file: string; line: number; text: string }[]; truncated: boolean }
>({
  name: "search_files",
  description: "Search file contents with a regular expression. Optionally restrict files with a glob.",
  kind: "read",
  parametersSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for" },
      path: { type: "string", description: "Directory to search (relative to workspace root; default: the root)" },
      glob: { type: "string", description: "Only search files matching this glob, e.g. `*.ts`" },
      caseInsensitive: { type: "boolean" },
    },
    required: ["pattern"],
  },
  summarize: (args) => `Search for ${argText(args?.pattern)}`,
  failure: (args) => `Failed to search for ${args.pattern}`,
  async run(args, context) {
    const root = resolveWorkspacePath(context.cwd, args.path ?? ".");
    const matcher = new RegExp(args.pattern, args.caseInsensitive ? "i" : "");
    const fileFilter = args.glob ? globToRegex(args.glob) : null;
    const matches: { file: string; line: number; text: string }[] = [];

    for await (const file of walkFiles(root)) {
      if (fileFilter && !fileFilter.test(file) && !fileFilter.test(path.posix.basename(file))) continue;
      let text: string;
      try {
        text = await fs.readFile(path.join(root, file), "utf-8");
      } catch {
        continue; // unreadable file: skip rather than fail the whole search
      }
      if (text.includes("\0")) continue; // binary
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (!matcher.test(lines[i]!)) continue;
        matches.push({ file, line: i + 1, text: lines[i]! });
        if (matches.length >= MAX_MATCHES) return { matches, truncated: true };
      }
    }
    return { matches, truncated: false };
  },
});
