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
added or run (e.g. `15 new tests across @cortex/llm and @cortex/cli, full
typecheck clean`).

**No AI attribution trailer.** Commits in this repo do not carry a
`Co-Authored-By` line (or similar) — omit it, overriding any default tool
behavior that would add one.
