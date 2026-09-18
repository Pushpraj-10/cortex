# Cortex

A local-first CLI coding agent: refactor, write tests, fix bugs, and add features
through a tool-using agent loop. Runs against a local model (Ollama) — no API key
needed.

## Setup

```
npm install
npm run dev
```

Make sure Ollama is running (`ollama serve`) and has a model pulled (e.g.
`ollama pull llama3.1:8b`). Cloud providers (Anthropic, Groq) aren't wired up yet — see
`TASKS.md`.

At the `>` prompt: type a task and the agent runs it (plans, reads/searches/edits
files, runs commands as needed); `/exit` quits.

## Architecture

An npm-workspaces monorepo: `apps/cli` is the composition root, everything else is
an independent package under `packages/`. The whole system is deliberately scoped to
one flow — `Prompt -> Agent(Planning, Context Building, Reasoning, Tool Calls) ->
task completion` — and nothing else, so the core loop stays small enough to debug.

```
apps/
  cli/            Entrypoint. Wires providers/tools, drives the REPL. Owns no
                  implementation logic of its own.

packages/
  shared/         Result type, CortexError, Logger, generateId, resolveWorkspacePath.
                  The only package every other package may depend on for reuse.
  llm/            Provider-agnostic chat layer; self-registering provider
                  descriptors (currently: Ollama). No provider branches outside it.
  tools/          Agent-invokable tools (list/read/search/write/edit_file,
                  apply_patch, run_command). Talks to fs directly — no shared
                  "repository" dependency.
  context/        Assembles what the model sees from independently registered
                  ContextProviders (explicit file mentions, import-scan, related
                  test/config files) — not a fixed analyze/plan/implement pipeline.
  planner/        Optional, LLM-backed multi-step task planner. The agent loop may
                  or may not consult it; a plan is context, never control flow.
  execution/      The one place a tool handler actually gets invoked, with optional
                  approval gating for mutating tools.
  prompts/        {{key}}-templated system/task prompts, registry-backed.
  storage/        Generic JSON-file persistence under .cortex/ (gitignored).
                  Type-agnostic — domain packages build typed wrappers on top.
  agent/          The orchestrator: the chat tool-use loop, composed from
                  everything above.
```

Each package implements what it needs independently rather than depending on
another package purely to reuse a capability (e.g. `tools` and `context` each have
their own filesystem access, rather than sharing one "repository" package) —
`shared` is the one deliberate exception, as the designated leaf dependency. See
each package's own `README.md` for its actual contract.

## Extending

- **New LLM provider**: add `packages/llm/src/providers/<name>/`, exporting a
  `LLMProviderDescriptor`; register it in `apps/cli/src/wiring/registerLLMProvider.ts`.
- **New tool**: add it under `packages/tools/src/filesystem/` or `shell/`, add it to
  the exported array; `apps/cli` picks it up automatically via `registerAllTools()`.

There's no per-task logic for "refactor" vs "fix bug" vs "add a feature" — it's all
the same chat loop and system prompt; the model decides which tools to call.

## Known limitations (v0.1, MVP)

See `TASKS.md` for the full checklist. Notably: no streaming, no build step for a
real `npx cortex` binary (dev only, via `tsx`), no Ink TUI yet (plain `readline`),
Anthropic/Groq providers not implemented, `run_command` has no sandboxing beyond
approval gating. Security review/remediation workflows (`/review`, `/fix`) were
removed to shrink the codebase down to the core reasoning loop for debugging — they
may return once that loop is solid.
