import type { ToolDef } from "./types";
import { globToRegex } from "./_shared/glob-to-regex";
import { resolvePath } from "./_shared/resolve-path";
import { walkFiles } from "./_shared/walk-files";

export const globTool: ToolDef = {
  name: "Glob",
  description: "Find files by glob pattern (e.g. `src/**/*.ts`). Returns paths relative to the search root.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: { pattern: { type: "string" }, path: { type: "string", description: "search root (default cwd)" } },
    required: ["pattern"],
  },
  async run(input, ctx) {
    const root = input.path ? resolvePath(ctx.cwd, input.path) : ctx.cwd;
    const re = globToRegex(String(input.pattern));
    const hits: string[] = [];
    for await (const f of walkFiles(root)) if (re.test(f)) hits.push(f);
    return hits.length ? hits.sort().join("\n") : "No files found";
  },
};
