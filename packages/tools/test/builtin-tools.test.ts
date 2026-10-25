import { describe, expect, it } from "vitest";
import { builtinTools } from "../src/builtin-tools.js";

describe("builtinTools", () => {
  it("has unique, snake_case names", () => {
    const names = builtinTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it("classifies every tool: only inspection tools are read, shell is execute", () => {
    const kindOf = (name: string) => builtinTools.find((t) => t.name === name)?.kind;
    for (const name of ["read_file", "list_directory", "file_exists", "get_file_info", "find_files", "search_files"]) {
      expect(kindOf(name)).toBe("read");
    }
    for (const name of ["write_file", "edit_file", "create_directory", "copy_file", "move_file", "delete_file"]) {
      expect(kindOf(name)).toBe("edit");
    }
    expect(kindOf("run_command")).toBe("execute");
  });

  it("gives every tool a summary that tolerates missing or malformed args", () => {
    for (const tool of builtinTools) {
      expect(tool.summarize, tool.name).toBeTypeOf("function");
      expect(() => tool.summarize!({} as never)).not.toThrow();
      expect(() => tool.summarize!(undefined as never)).not.toThrow();
    }
  });

  it("summarizes calls the way the CLI used to", () => {
    const summary = (name: string, args: unknown) => builtinTools.find((t) => t.name === name)!.summarize!(args as never);
    expect(summary("read_file", { path: "a.ts" })).toBe("Read a.ts");
    expect(summary("move_file", { from: "a", to: "b" })).toBe("Move a → b");
    expect(summary("create_directory", { path: "d" })).toBe("Create directory d");
    expect(summary("file_exists", { path: "a" })).toBe("Check a exists");
    expect(summary("get_file_info", { path: "a" })).toBe("Get info for a");
    expect(summary("read_file", {})).toBe("Read ?");
  });
});
