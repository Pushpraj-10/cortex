import { readFile, writeFile } from "node:fs/promises";
import type { ToolDef } from "./types";
import { resolvePath } from "./_shared/resolve-path";

export const editTool: ToolDef = {
  name: "Edit",
  description:
    "Replace old_string with new_string in a file. old_string must match exactly once unless replace_all is true.",
  readOnly: false,
  inputSchema: {
    type: "object",
    properties: {
      file_path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean" },
    },
    required: ["file_path", "old_string", "new_string"],
  },
  async run(input, ctx) {
    const path = resolvePath(ctx.cwd, input.file_path);
    const oldStr = String(input.old_string);
    const newStr = String(input.new_string);
    if (oldStr === newStr) throw new Error("old_string and new_string are identical");
    const text = await readFile(path, "utf8");
    const count = oldStr === "" ? 0 : text.split(oldStr).length - 1;
    if (count === 0) throw new Error("old_string not found in file");
    if (count > 1 && !input.replace_all) {
      throw new Error(`old_string matches ${count} times; add context to make it unique or set replace_all`);
    }
    await writeFile(path, text.split(oldStr).join(newStr), "utf8");
    return `Edited ${path} (${count} replacement${count > 1 ? "s" : ""})`;
  },
};
