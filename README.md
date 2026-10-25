# Cortex

A local-first CLI coding agent. It talks to a model — Ollama on your machine, or Google Gemini / Anthropic in the cloud — reads and edits your project through sandboxed tools, and asks before it does anything risky.

## Install

```
npm install -g @pushpraj_10/cortex
cd your-project
cortex                    # full-screen terminal UI, working on the current folder
cortex -p "explain what src/index.ts does"    # one shot: answer to stdout
```

On first run, type `/provider` to pick a provider and save its API key and model; they are kept in `~/.cortex/credentials.json` (plain text, so treat it like any other secret). For Ollama, run `ollama serve`, pull a model that supports tool calling (for example `ollama pull llama3.1`), and set `OLLAMA_MODEL`.

Needs Node 22.12 or newer.

## Run from source

```
npm install
cp .env.example .env      # set OLLAMA_MODEL (local), or a cloud key + model
npm run dev               # full-screen terminal UI
npm run dev -- -p "explain what src/index.ts does"    # one shot: answer to stdout
npm run build             # bundle the installable package into apps/cli/dist
```

## Using it

| Command | What it does |
| --- | --- |
| `/help` | commands and keyboard shortcuts |
| `/clear` | start a new conversation |
| `/mode [name]` | show or set the permission mode |
| `/provider [name]` | set up a provider's API key and model, and switch to it (`/provider remove <name>` forgets it) |
| `/model` | show the active model and provider |
| `/quit` | exit |

Keys: `enter` sends, `shift+enter` adds a newline, `shift+tab` cycles the permission mode, `esc` interrupts, `ctrl+t` expands the last tool call, `ctrl+c` quits. Name files in your message (`fix src/parser.ts`) and the agent is handed those files, their imports and tests, and what imports them.

Flags: `--mode <mode>` sets the permission mode, `-p <prompt>` runs one prompt without the UI (tool calls go to stderr, the answer to stdout, and anything needing approval is refused unless the mode or a rule allows it).

### Permission modes

| Mode | Reads | Edits | Commands |
| --- | --- | --- | --- |
| `default` | run | ask | ask |
| `acceptEdits` | run | run | ask |
| `plan` | run | denied | denied |
| `bypassPermissions` | run | run | run |

Deny rules always win, even in `bypassPermissions`.

## Configuration

**Provider** — `CORTEX_PROVIDER` picks `ollama`, `google` or `anthropic`; if it is unset, Ollama is used. The cloud providers are never chosen automatically, so an API key exported for other tools can't start sending your code to a cloud. Each provider needs its model variable (`OLLAMA_MODEL`, `GOOGLE_MODEL`, `ANTHROPIC_MODEL`) and, for the cloud ones, a key (`GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`); see `.env.example`.

**Setting up a provider from the app** — no environment files needed: run `cortex`, type `/provider`, pick a provider and answer two questions (the API key is typed hidden, and never shown, logged or added to the conversation). It is saved and used straight away, and remembered next time. If nothing is configured yet the app still opens and tells you to do this.

- **Where:** `~/.cortex/credentials.json` in your home directory — never in the project, so it can't be committed. It is written readable by you only (on Windows it relies on your user profile's folder permissions) and it is **plain text**, so prefer an environment variable if that doesn't suit you.
- **Precedence:** a set environment variable (`GOOGLE_API_KEY`, `CORTEX_PROVIDER`, …) beats what is saved, and the app tells you when one is overriding what you just entered. An empty variable counts as unset.
- **Forgetting:** `/provider remove <name>` deletes a provider's saved settings; or delete the file.

**Settings** — `.cortex/settings.json` in the project (and `~/.cortex/settings.json` for you) are merged. A malformed file is an error, not silently ignored.

```json
{
  "permissions": {
    "defaultMode": "default",
    "allow": ["run_command(npm test:*)"],
    "deny": ["run_command(rm:*)"]
  },
  "hooks": [
    { "event": "PreToolUse", "matcher": "run_command", "command": "node scripts/check-command.js" }
  ],
  "mcpServers": { "files": { "command": "npx", "args": ["-y", "some-mcp-server"] } }
}
```

Rules are `tool_name` or `tool_name(pattern)`, where the pattern is an exact value, `prefix:*`, or `prefix*`. Hooks receive the event as JSON on stdin; exit code 2 blocks the action and its stderr goes back to the model. Events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`.

**Memory** — `CORTEX.md` in the project (and `~/.cortex/CORTEX.md`) is added to the system prompt.

**Skills** — `.cortex/skills/<name>/SKILL.md` with `name` and `description` frontmatter. Only the name and description sit in the prompt; the model loads the body with the `skill` tool when it needs it.

## How it fits together

An npm-workspaces monorepo. Each package is one component with its own tests. The "Depends on" column is the complete list of allowed dependencies, read bottom-up (`core` depends on nothing); `tests/architecture.test.ts` fails the build if a package's source, `package.json` or `tsconfig.json` disagree with it.

| Package | Responsibility | Depends on |
| --- | --- | --- |
| [`@cortex/core`](packages/core) | `Result` and `CortexError`, the workspace sandbox check, the `Logger` type | — |
| [`@cortex/providers`](packages/providers) | the model contract, a registry, and the Ollama, Google and Anthropic clients | core |
| [`@cortex/tools`](packages/tools) | file, search and shell tools; each declares what it does (`read`, `edit`, `execute`) | core |
| [`@cortex/context`](packages/context) | gathers the files, imports, tests and dependents relevant to a message | core |
| [`@cortex/policy`](packages/policy) | permission modes and rules, and hooks | tools (types only) |
| [`@cortex/extensions`](packages/extensions) | skills and MCP servers | tools |
| [`@cortex/config`](packages/config) | layered settings and `CORTEX.md` memory | extensions, policy |
| [`@cortex/agent`](packages/agent) | the tool-use loop, the policy-gated executor, compaction, subagents | core, providers, tools, context, policy |
| [`apps/cli`](apps/cli) | the terminal UI and the one place everything is wired together | all of the above |

The agent loop is open and model-driven: there are no fixed analyze/plan/implement stages. What happens on a turn comes from the context the model is given and the tools it chooses to call.

## Development

```
npm run typecheck        # tsc --build across every package and tests/
npm test                 # all unit tests plus the architecture test
npm run test:packages    # each package's tests in isolation (also: npm test -w @cortex/policy)
npm run test:e2e         # live-model scripts in tests/ (needs Ollama running)
```

Conventions: related small things live in one commented file per feature rather than one function per file, and each package's `test/` mirrors its `src/`. Commit messages follow [CLAUDE.md](CLAUDE.md).

Known limits: no streaming yet, and `run_command` is gated only by approval, not sandboxed.
