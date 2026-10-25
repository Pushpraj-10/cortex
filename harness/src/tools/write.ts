import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolDef } from "./types";
import { resolvePath } from "./_shared/resolve-path";

export const writeTool: ToolDef = {
  name: "Write",
  description: "Create or overwrite a file with the given content. Parent directories are created.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: { file_path: { type: "string" }, content: { type: "string" } },
    required: ["file_path", "content"],
  },
  async run(input, ctx) {
    const path = resolvePath(ctx.cwd, input.file_path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, String(input.content ?? ""), "utf8");
    return `Wrote ${path}`;
  },
};
