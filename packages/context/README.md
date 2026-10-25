# @cortex/context

Assembles what the model sees about the workspace each turn, from independently registered
`ContextProvider`s. It depends only on `@cortex/core` and knows nothing about the agent loop:
`@cortex/agent` calls `gatherContext(request)` and gets back one text block (or `""`).

## How a turn's context is built

```
registered providers
   │  selectProviders   skip providers whose applies(request) is false
   ▼
applicable providers
   │  gather (parallel; a failing/throwing provider is logged and ignored)
   ▼
fragments
   │  dedupeFragments   identical title+content collapse to one
   │  rankFragments     highest `relevance` first, ties keep provider order
   │  applyBudget       keep fragments until maxChars; truncate the one that crosses
   ▼                    the line, drop the rest and say how many were left out
renderContextBlock  →  "# Workspace Context\n\n## <title>\n<content>…"
```

The block is rebuilt from scratch every turn and sent as a trailing message; it is never stored
in the conversation history (see `@cortex/agent`'s `runToolLoop`).

## Providers

| Provider | Applies when | Contributes | Relevance |
|---|---|---|---|
| `workspaceOverviewProvider` | always | top-level listing, `package.json` name/description, README excerpt | 0.1 |
| `mentionedFilesProvider` | the message contains something that looks like a file (`src/a.ts`, `tool-loop.ts`) | the contents (first 4,000 chars) of each file it names that resolves to exactly one real file, max 3 | 1 |
| `relatedFilesProvider` | same | for each such file: the workspace files it imports and the tests beside it (paths only) | 0.5 |
| `dependentsProvider` | the message names a source file (`.ts/.tsx/.js/.jsx/.mjs/.cjs/.mts/.cts`) | for each such file: who imports it, and who imports *those* (up to 3 hops, 30 files), nearest first — the ripple of an edit | 0.4 |

"Looks like a file" means a known extension (see `src/workspace/extract-file-mentions.ts`), not
any word with a dot. A mention that doesn't exist, is ambiguous (`index.ts` in five places), or
escapes the workspace is skipped rather than guessed at.

## The import graph (how `dependentsProvider` scales)

Finding "who imports X" means knowing every file's imports, so the cost has to be paid once, not
every turn. `src/graph/` keeps an in-memory index per workspace for the life of the process:

- **Index** (`updateImportIndex`): walks the workspace (ignoring `node_modules`/`.git`/`dist`, up to 20,000
  files, 8 levels deep), `stat`s each source file in batches of 32, and re-reads **only files that are new or
  whose mtime/size changed**. Unchanged records are reused as-is; deleted files drop out. First call on a
  workspace = a full scan; later calls ≈ one `stat` per file plus a re-parse of whatever was edited since —
  including edits the agent's own tools made, so there is no invalidation hook to forget. Files over 256 KiB
  are indexed with no imports.
- **Records hold raw specifiers, not resolved paths.** Resolution (`.js`→`.ts`, extensionless, `index` files)
  happens in `buildImportGraph` against the *current* file set using set lookups (no IO), so creating or
  deleting a file can never leave a stale edge.
- **Cross-package imports are followed.** `package.json` files are indexed too (name + `main`/`module`/`types`),
  so `import … from "@cortex/core"` becomes an edge to that package's entry point (and
  `@cortex/core/sub` to the file under its directory). That's what lets an edit in a leaf package show
  the packages that depend on it. Third-party and `node:` imports resolve to nothing and are dropped.
- **Query** (`findDependents`): breadth-first over the reversed edges with a depth cap (3) and result cap (30),
  cycle-safe, sorted within a depth for stable output.
- The scan honours the turn's `AbortSignal`; an aborted scan is discarded and leaves the cache as it was.
- `clearImportIndexCache()` forces a fresh scan (used by tests).

Everything else (`mapInBatches`, `listImportCandidates`, …) is a small single-purpose function in
`src/graph/` or `src/workspace/`, so a different consumer (say, a per-edit impact report) can reuse
`getImportGraph` + `findDependents` directly.

## Writing a provider

```ts
const myProvider: ContextProvider = {
  id: "my-provider",
  displayName: "My Provider",
  applies: (request) => /* cheap, synchronous-ish check on request.userMessage; omit to always apply */,
  async gather(request) {
    return ok([{ providerId: "my-provider", title: "…", content: "…", relevance: 0.6 }]);
  },
};
```

Register it once at startup in the composition root (`apps/cli/src/wiring/register-context-providers.ts`);
nothing registers itself on import. Keep `applies` cheap and do the IO in `gather`. Use `relevance`
to say how much the fragment matters *to this request*: it decides both render order and what survives
the budget.

## API

- `gatherContext(request, deps?)` — `deps`: `providers` (default: all registered), `logger`, `maxChars` (default 12,000).
- `registerProvider` / `getProvider` / `listProviders`.
- `ContextRequest` `{ workspaceRoot, userMessage, signal? }`, `ContextFragment` `{ providerId, title, content, relevance? }`.

## Not (yet) here

Conversation memory and error context (they need the chat history passed in) and an on-disk index (the
graph is rebuilt per process). Context is gathered once per `chat()` call, *before* the tool loop, so the
dependents shown are those of the files the user's message names — not of files the agent goes on to edit
mid-turn; those show up on the next message. Only JS/TS imports are tracked (no tsconfig `paths` aliases,
no `package.json` `exports` maps, no other languages), and they are found with a regex scan rather than a
parse, so an import inside a comment can show up as a false positive. A package that is imported through
its entry point makes that entry file a hub, so ripples through it are broad by design — they are
capped at 30 files, nearest first.
