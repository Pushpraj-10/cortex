# @cortex/shared

Cross-cutting vocabulary every other package builds on: a `Result` type for fallible
operations, a `CortexError` base class, a minimal `Logger` interface, and id
generation. This is the leaf of the dependency graph — it must never import from
another `@cortex/*` package.

## API

- `Result<T, E>`, `ok(value)`, `err(error)` — explicit success/failure without throwing.
- `CortexError` — base class other packages extend for typed, catchable errors.
- `Logger`, `createLogger(scope)` — structured logging contract.
- `generateId()` — collision-resistant id for sessions, tool calls, etc.
- `resolveWorkspacePath(root, relativePath)` — the one place that enforces "no path
  may escape the workspace root," shared by every filesystem-touching adapter.
