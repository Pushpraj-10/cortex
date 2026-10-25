# @cortex/core

The small vocabulary every other package shares. It depends on nothing, and must stay that way.

| Export | What it is |
| --- | --- |
| `Result<T>`, `ok(value)`, `err(error)` | expected failures are returned, not thrown |
| `CortexError(message, code, cause?)` | base error with a stable machine-readable `code`; subclasses name themselves via `name` |
| `resolveWorkspacePath(root, relativePath)`, `WorkspaceBoundaryError` | the workspace sandbox: resolves a path under `root`, throws if it escapes (by `..`, an absolute path, a leading slash, or a sibling directory sharing the root's name as a prefix) |
| `Logger` | the interface a component needs to report something without caring where it goes |

Every file tool resolves its paths through `resolveWorkspacePath`, so the boundary lives in one place.

## Files

- `src/result.ts` — `Result`, `ok`, `err`, `CortexError`
- `src/workspace-path.ts` — the sandbox check
- `src/logger.ts` — the `Logger` type
- `src/index.ts` — the public API

Tests: `npm test -w @cortex/core`.
