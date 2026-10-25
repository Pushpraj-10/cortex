import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { editTool } from "../../src/tools/edit";

async function fixture(content: string) {
  const dir = await mkdtemp(join(tmpdir(), "edit-"));
  await writeFile(join(dir, "f.txt"), content);
  return dir;
}

describe("editTool", () => {
  it("replaces a unique match", async () => {
    const cwd = await fixture("a b c");
    await editTool.run({ file_path: "f.txt", old_string: "b", new_string: "X" }, { cwd });
    expect(await readFile(join(cwd, "f.txt"), "utf8")).toBe("a X c");
  });

  it("rejects ambiguous matches unless replace_all", async () => {
    const cwd = await fixture("a a");
    await expect(editTool.run({ file_path: "f.txt", old_string: "a", new_string: "b" }, { cwd })).rejects.toThrow(/2 times/);
    await editTool.run({ file_path: "f.txt", old_string: "a", new_string: "b", replace_all: true }, { cwd });
    expect(await readFile(join(cwd, "f.txt"), "utf8")).toBe("b b");
  });

  it("rejects missing matches", async () => {
    const cwd = await fixture("abc");
    await expect(editTool.run({ file_path: "f.txt", old_string: "zzz", new_string: "b" }, { cwd })).rejects.toThrow(/not found/);
  });
});
