# @cortex/tools

The tools an agent can execute, and a registry to look them up by name.

A tool is a `ToolDefinition`: `name`, `description`, a JSON-schema `parametersSchema`, a `kind`, an optional `summarize(args)`, and `handler(args, context)` returning a `Result`. `kind` says what the tool does to the world — `read` (only inspects), `edit` (changes files in the workspace) or `execute` (runs arbitrary commands) — so approval policy never needs to know tool names. `summarize` gives UIs a one-line description such as "Read src/a.ts".

A tool may also offer `preview(args, context)`, which says what a call **will** change without changing anything, so a UI can show it before the user approves: a `diff` (the affected lines plus two lines of context, the true starting line number, and `isNew` for a file that does not exist yet) or a `command`. `write_file` and `edit_file` read the file to build a real diff; `run_command` previews the command. A preview must not throw: it returns `undefined` for bad arguments, an edit that cannot apply, a path outside the workspace, or a file over 256 KB. UIs render whatever preview a tool gives and never need tool names.

## Built-in tools

| Kind | Tools |
| --- | --- |
| `read` | `read_file`, `list_directory`, `file_exists`, `get_file_info`, `find_files` (glob), `search_files` (regex) |
| `edit` | `write_file`, `edit_file`, `create_directory`, `copy_file`, `move_file`, `delete_file` |
| `execute` | `run_command` |

All paths go through `resolveWorkspacePath`, so a file tool cannot touch anything outside the workspace. `run_command` is the exception — a command can do anything, which is why it is `execute` and goes through approval. `edit_file` replaces the first occurrence and fails (rather than reporting success) when the text is not found. `find_files` and `search_files` skip `node_modules`, `.git` and `dist`.

## Adding a tool

`defineTool` owns the try/catch: whatever `run` returns becomes an ok `Result`, whatever it throws becomes a `ToolError`.

```ts
export const wordCountTool = defineTool<{ path: string }, { words: number }>({
  name: "word_count",
  description: "Count the words in a file",
  kind: "read",
  parametersSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  summarize: (args) => `Count words in ${argText(args?.path)}`,
  failure: (args) => `Failed to count words in ${args.path}`,
  async run(args, context) {
    const text = await fs.readFile(resolveWorkspacePath(context.cwd, args.path), "utf-8");
    return { words: text.split(/\s+/).filter(Boolean).length };
  },
});
```

Add it to `src/builtin-tools.ts` (and export it from `src/index.ts`), or register it from anywhere with `registerTool`.

## Files

`types.ts` (the contract) · `define-tool.ts` · `registry.ts` · `builtin-tools.ts` · `filesystem.ts` · `search.ts` · `shell.ts`

Tests: `npm test -w @cortex/tools`.
