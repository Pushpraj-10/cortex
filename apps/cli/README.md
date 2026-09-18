# @cortex/cli

The entrypoint app — the composition root, and nothing else. It registers LLM
provider descriptors and tools; loads `.cortex/config.json`; constructs an
`AgentSession`; and drives the interactive REPL. It owns wiring and the
input/render loop only — no implementation logic that belongs in a package (every
`packages/*` module stays reachable, testable, and reasoned about without reference
to the CLI).

## Running it

```
npm run dev
```

Runs `apps/cli/src/index.ts` directly via `tsx` (no build step yet — see "Known
limitations" below). Needs [Ollama](https://ollama.com) running locally with a model
pulled (`ollama pull llama3.1:8b`); no API key required, since Ollama is the only
provider implemented so far (Anthropic/Groq are postponed — see root `TASKS.md`).

At the `>` prompt:
- Plain text → the coding-agent chat loop.
- `/exit` (or Ctrl+D / closed stdin) → quit.

## Structure

- `src/config/` — `.cortex/config.json` (provider, model, `baseUrl`), via
  `@cortex/storage`.
- `src/internal/` — `.env` loading (a ~20-line hand-rolled parser, not a new
  dependency) and the shared `readline` `Prompter` (one interface serves both the
  REPL's own input and the executor's tool-call approval prompts, so they never race
  over stdin).
- `src/wiring/` — registers the built-in tools and the Ollama LLM provider;
  constructs an `LLMClient` from config. Nothing here is auto-registered on import
  anywhere in this codebase, so this is where that actually happens, once, at
  startup.
- `src/render/` — pure `AgentEvent` → plain-text-lines formatting.
- `src/runReplLoop.ts` — the REPL loop itself: read a line, `/exit` stops it,
  everything else goes to `session.chat()`. No command table — chat is the only
  thing this CLI does.

## Known limitations

- No build step: `bin.cortex` points at `src/index.ts` directly, which only runs via
  `tsx` (`npm run dev`), not a plain `node` invocation of an installed package. A
  real `npx cortex` entrypoint needs a build step (e.g. `tsup`) — not done yet.
- No streaming — each turn is request/response, not token-by-token.
- Only Ollama is wired; the LLM/prompts layers already support adding more providers
  without changing their own code, but nothing calls `registerProvider` for
  Anthropic/Groq yet.
- No Ink TUI yet — this is a plain `readline` REPL. Fixed-layout TUI is tracked as
  later UX polish in `TASKS.md`.
- No `/review`/`/fix` security workflows. They existed in an earlier version of this
  codebase and were removed entirely, along with `packages/security` and
  `packages/verification`, to shrink the app down to the single
  `Prompt -> Agent(Planning, Context Building, Reasoning, Tool Calls) -> task
  completion` flow while its reasoning reliability is debugged.
