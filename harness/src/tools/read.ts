import { readFile } from "node:fs/promises";
import type { ToolDef } from "./types";
import { resolvePath } from "./_shared/resolve-path";

export const readTool: ToolDef = {
  name: "Read",
  description: "Read a file. Returns lines prefixed with 1-based line numbers. Use offset/limit for large files.",
  readOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      offset: { type: "number", description: "1-based first line" },
      limit: { type: "number", description: "max lines (default 2000)" },
    },
    required: ["file_path"],
  },
  async run(input, ctx) {
    const text = await readFile(resolvePath(ctx.cwd, input.file_path), "utf8");
    const start = Math.max(1, Number(input.offset ?? 1));
    const limit = Number(input.limit ?? 2000);
    return text
      .split("\n")
      .slice(start - 1, start - 1 + limit)
      .map((l, i) => `${start + i}\t${l}`)
      .join("\n");
  },
};
