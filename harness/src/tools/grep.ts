import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDef } from "./types";
import { globToRegex } from "./_shared/glob-to-regex";
import { resolvePath } from "./_shared/resolve-path";
import { walkFiles } from "./_shared/walk-files";

const MAX_MATCHES = 250;

export const grepTool: ToolDef = {
  name: "Grep",
  description: "Search file contents with a regex. Returns `path:line:text`. Optional `glob` filters files.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      path: { type: "string" },
      glob: { type: "string" },
      case_insensitive: { type: "boolean" },
    },
    required: ["pattern"],
  },
  async run(input, ctx) {
    const root = input.path ? resolvePath(ctx.cwd, input.path) : ctx.cwd;
    const re = new RegExp(String(input.pattern), input.case_insensitive ? "i" : "");
    const fileRe = input.glob ? globToRegex(String(input.glob)) : null;
    const out: string[] = [];
    for await (const f of walkFiles(root)) {
      if (fileRe && !fileRe.test(f) && !fileRe.test(f.split("/").pop()!)) continue;
      let text: string;
      try {
        text = await readFile(join(root, f), "utf8");
      } catch {
        continue;
      }
      if (text.includes("\0")) continue; // binary
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]!)) out.push(`${f}:${i + 1}:${lines[i]}`);
        if (out.length >= MAX_MATCHES) return out.join("\n") + `\n[truncated at ${MAX_MATCHES} matches]`;
      }
    }
    return out.length ? out.join("\n") : "No matches found";
  },
};
