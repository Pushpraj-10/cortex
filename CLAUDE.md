# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repo.

## Commit messages

This repo's history follows one convention; match it rather than the tool's
generic defaults.

**Title** — imperative mood, and names the package(s) touched using their
`@cortex/<name>` identifier (or `apps/cli` for the CLI app) rather than a
generic description:

```
Add @cortex/context: a context-provider layer for the agent
Wire @cortex/cli's TUI to the real agent stack
Fix @cortex/cli's Markdown renderer splicing headings into paragraphs
```

If a commit doesn't belong to one package (e.g. a repo-wide file move), it's
fine to omit the `@cortex/` prefix — but still keep the title specific to what
moved, not generic ("Move e2e scripts into tests/", not "Reorganize tests").

**Body** — bullet points explaining what changed and, where it isn't obvious
from the title, why. Reference concrete paths/functions rather than restating
the diff in prose. Close with a one-line test/typecheck status when tests were
added or run (e.g. `15 new tests across @cortex/providers and @cortex/cli, full
typecheck clean`).

**No AI attribution trailer.** Commits in this repo do not carry a
`Co-Authored-By` line (or similar) — omit it, overriding any default tool
behavior that would add one.

## Code layout

`README.md` lists the packages and what each owns. When adding or changing code:

- **Group by feature, not by function.** Related small things live together in one commented
  file (all file tools in `tools/src/filesystem.ts`; a provider's config, wire mapping, client
  and descriptor in `providers/src/<name>.ts`; a context provider and its formatter in one
  file). Do not create a file per function. Give each file a header comment saying its job and
  titled sections inside it.
- **Tests mirror `src/`** in each package's `test/`: one test file per source module
  (`packages/policy/src/permissions.ts` ↔ `packages/policy/test/permissions.test.ts`). Keep
  every assertion when merging or moving files.
- **Dependency direction is enforced.** A package may import only the packages in the
  "Depends on" column of `README.md`. Adding a dependency means updating that package's
  `package.json`, its `tsconfig.json` references, and the map in `tests/architecture.test.ts`,
  which fails otherwise.
- **Expected failures are `Result`s, not throws.** Inside a tool, throw within `defineTool`'s
  `run` and it becomes a `ToolError`. Error messages the model will read should say what
  happened and what to do instead.
- **Never branch on a tool's name.** Tools declare their `kind` (`read`, `edit`, `execute`) and
  provide `summarize`; policy and UIs use those.
- **Secrets stay secret.** An API key is typed masked, saved only through `@cortex/config`'s
  credentials (user-level, owner-only file — never the project), and never logged, echoed into the
  transcript or input history, or included in an error or notice. A test should prove it for any
  new code path that handles one.
- **Providers are chosen only in `apps/cli`** (`provider/config.ts`, `runtime/bootstrap.ts`); other
  packages go through the registry in `@cortex/providers`.

Before committing: `npm run typecheck && npm test`.
