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

## Files

`settings.ts` · `memory.ts` · `credentials.ts` · `preferences.ts`. Depends on `@cortex/policy` and `@cortex/extensions` for types, and on `isPermissionMode` for validation.

Tests: `npm test -w @cortex/config`.
