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

## Saved provider settings (`src/credentials.ts`)

API keys, models and server URLs entered in the app (`/provider`) live in `~/.cortex/credentials.json`: `{ "activeProvider": "<id>", "providers": { "<id>": { "apiKey", "model", "baseUrl" } } }`. User level only — never the project, whose `.cortex/settings.json` may be committed. Provider ids are plain strings here; this package knows nothing about specific providers.

- `loadCredentials(home?)` — a missing file is empty; a malformed one throws with the file's path but **never its contents**
- `saveProviderCredentials(provider, values, { home?, activate? })` — merges over what was saved, trims, drops blanks and unknown fields; `activate` makes it the default
- `removeProviderCredentials(provider, home?)` — returns whether anything was saved
- Writes go to a temporary file created owner-only (`0600`, folder `0700`) and are renamed into place, so a crash can't leave a half-written or readable file. On Windows the permission bits are not enforced; the file is protected by your profile folder's access rules. It is plain text.

## Preferences (`src/preferences.ts`)

Cosmetic choices made in the app (today the `/theme`) live in `~/.cortex/preferences.json`: `{ "theme": "<name>" }`. Kept apart from settings (security-relevant, strict) and credentials (keys): **a missing, unreadable or malformed file is read as "nothing chosen"**, because a damaged preference must never stop the app. The theme is a plain string here; the UI validates it.

- `loadPreferences(home?)` — never throws
- `savePreferences(values, home?)` — merges over what was saved, written through a temporary file and a rename

## Message history (`src/history.ts`)

The messages typed in a project, kept so up-arrow and ctrl+r can recall them in the next session. One file per project, `~/.cortex/history/<id>.jsonl`, where `<id>` is the first 16 hex characters of a hash of the project's folder (so one repo's messages are not offered in another, and the folder's name is not written into a file name). Each line is one JSON string, so a multi-line message stays on one line and a damaged line costs only itself. User level only and owner-only like credentials (`0600`, folder `0700`; not enforced on Windows). It is plain text.

- `loadHistory(cwd, home?)` — the newest `MAX_HISTORY_ENTRIES` (500), oldest first; **never throws**: a missing, unreadable or damaged file is no history
- `appendHistory(cwd, text, home?)` — ignores blank text and anything over `MAX_HISTORY_ENTRY_CHARS` (10,000, so a pasted log is not kept); rewrites the file with only the newest entries once it passes 256 KB; rejects if the file cannot be written, for the caller to catch
- `historyPath(cwd, home?)`

What goes in is the caller's decision. The CLI saves each message it sends and nothing typed into `/provider`, where an answer can be an API key (`apps/cli/test/ui/app.test.tsx` proves a typed or pasted key never reaches it).

## Files

`settings.ts` · `memory.ts` · `credentials.ts` · `preferences.ts` · `history.ts`. Depends on `@cortex/policy` and `@cortex/extensions` for types, and on `isPermissionMode` for validation.

Tests: `npm test -w @cortex/config`.
