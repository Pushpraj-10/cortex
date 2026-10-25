# @cortex/config

What the user has configured, loaded from disk.

## Settings (`src/settings.ts`)

`loadSettings(cwd, home?)` merges `~/.cortex/settings.json` (user) and `<project>/.cortex/settings.json` (project):

| Field | Merge |
| --- | --- |
| `permissions.allow` / `permissions.deny` | accumulate, user then project |
| `permissions.defaultMode` | project wins |
| `hooks` | accumulate |
| `mcpServers` | merged by name, project wins |

A missing file is fine. A **malformed file, or a `defaultMode` that is not a permission mode, throws** with the file's path: silently ignoring a file that holds deny rules or hooks would be worse than stopping.

## Memory (`src/memory.ts`)

`loadMemory(cwd, home?)` returns `~/.cortex/CORTEX.md` and `<project>/CORTEX.md` under "User instructions" and "Project instructions" headings (missing files skipped, `""` if neither exists). The agent adds it to the system prompt.

## Files

`settings.ts` · `memory.ts`. Depends on `@cortex/policy` and `@cortex/extensions` for types, and on `isPermissionMode` for validation.

Tests: `npm test -w @cortex/config`.
