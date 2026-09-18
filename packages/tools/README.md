# @cortex/tools

The catalogue of actions the agent can invoke (read/write files, run shell commands,
search, etc.). A tool is defined once as a `ToolDefinition` and registered; nothing
else in the system needs to know how a given tool is implemented, only its name and
schema. `@cortex/execution` is the only package that should actually invoke a tool's
handler. This package depends on nothing but `@cortex/shared` — it doesn't reach into
any other package (e.g. a repository/context abstraction) just to reuse a capability,
so it stays usable entirely on its own.

## API

- `ToolDefinition<TArgs, TResult>` — `{ name, description, parametersSchema, mutates?, handler }`.
  `mutates: true` marks a tool as having side effects; callers (like the `/fix`
  approval gate) read this flag instead of hardcoding tool names.
- `ToolExecutionContext` — cwd, cancellation signal, logger passed to every handler.
- `registerTool(definition)` / `getTool(name)` / `listTools()`.
- `filesystemTools` — `list_files`, `read_file`, `search_files`, `write_file`,
  `edit_file`, `apply_patch`. Each talks to `node:fs` directly, scoped by
  `resolveWorkspacePath` (from `@cortex/shared`) against the `cwd` on the
  `ToolExecutionContext` passed to that call — no injected repository or other
  cross-package dependency. `apply_patch` takes a unified diff (git-style,
  `@@ -a,b +c,d @@` hunks) instead of a full file or a single string replacement, so
  the LLM can express multi-hunk edits without reproducing the whole file; every
  context/removed line is verified against the actual file content before being
  applied, and a mismatch raises `PatchContextMismatchError` /
  `PatchOffsetMismatchError` rather than silently corrupting the file.
  `write_file` rejects a write that would delete more than half of an existing file
  of five or more lines (`DestructiveRewriteError`), pointing the caller at
  `edit_file`/`apply_patch`; `allowFullRewrite: true` opts out for a deliberate
  whole-file replacement. This exists because prompt guidance alone did not hold: a
  real session replaced a working file's implementation with `# your code here`
  stubs while doing what it thought was a comment-adding task.
- `createShellTools()` — `run_command`, taking `{ command, args }` (never a raw
  shell string) so the LLM can't construct a shell-metacharacter injection. `command`
  is the program alone and `args` holds each argument separately; a whole command
  line placed in `command` fails to spawn and is reported as `UnsplitCommandError`,
  which names the correctly-split call, rather than as a bare `ENOENT` that reads
  like the program is missing.

## Why interpreter inline scripts are refused

`findDeniedCommand` blocks the file-moving verbs (`mv`, `cp`, `rm`, ...), including
inside a shell wrapper's `-c` string. That left a door open, and a model walked
through it unprompted:

```
run_command python -c "open('…/main.py','w').write(open('temp_file.txt').read())"
```

Opening with `'w'` truncated `main.py` to zero bytes immediately — before the missing
source file even raised — bypassing `resolveWorkspacePath`, `write_file`'s
`DestructiveRewriteError`, and all change reporting at once. So inline-script flags
(`-c`, `-e`, `--eval`, ...) are now refused for known interpreters (`python`, `node`,
`perl`, `ruby`, ...). This is a flat refusal, not a scan: a shell wrapper's script can
be checked for denied verbs, but `open(p,'w')`, `fs.writeFileSync` and every other way
these languages write a file are unbounded, and a word list pretending to catch them
would be security theatre. Running an interpreter on a file that exists
(`python manage.py migrate`, `node build.js`) is unaffected.
