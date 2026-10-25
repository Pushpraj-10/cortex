# @cortex/context

Assembles what the model sees about the project for one turn. Independent **context providers** each contribute fragments; `gatherContext` selects, runs, ranks and budgets them into one text block that the agent appends to the request. There is no fixed analyze/plan/implement pipeline — the model stays in charge, and better behaviour comes from better context.

```ts
registerContextProvider(mentionedFilesProvider);            // once, at startup
const block = await gatherContext({ workspaceRoot, userMessage, signal });   // "" when nothing applies
```

## The pipeline (`src/pipeline.ts`)

1. **select** — drop providers whose `applies(request)` is false (a throwing `applies` counts as false)
2. **gather** — run the rest in parallel; one provider's failure is logged and skipped, never fatal
3. **dedupe** — drop fragments with identical title and content
4. **rank** — most relevant first
5. **budget** — fit `maxChars` (default 12,000), truncating or dropping the least relevant and noting what was omitted
6. **render** — one `# Workspace Context` block

## Providers (`src/providers/`)

| Provider | Contributes | Relevance |
| --- | --- | --- |
| `mentioned-files` | the contents of files the message names | 1.0 |
| `related-files` | the imports and tests of those files (paths only) | 0.5 |
| `dependents` | which files import them, and which import those (paths only) | 0.4 |
| `workspace-overview` | top-level listing, `package.json` name/description, README excerpt | 0.1 |

The three file-based providers share one resolution of the message's file mentions per turn (`resolveRequestMentions`). Each provider file also holds its formatter.

To add one, implement `ContextProvider` (`id`, optional `applies`, `gather` returning `Result<ContextFragment[]>`) in `src/providers/<name>.ts`, export it from `src/index.ts`, and register it in `apps/cli/src/runtime/bootstrap.ts`.

## Other modules

- `workspace.ts` — walking the workspace, reading excerpts, finding and resolving file mentions, finding a file's tests; nothing here can read outside the root
- `imports.ts` — extracting import specifiers and resolving relative and `@scope/name` imports to candidate files
- `graph.ts` — an import index refreshed incrementally (only files whose mtime or size changed are re-parsed), forward and reverse edges, and a bounded reverse-dependency search
- `registry.ts`, `types.ts`

Tests: `npm test -w @cortex/context`.
