<div align="center">

<a href="https://github.com/Pushpraj-10/cortex">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Pushpraj-10/cortex/main/docs/assets/logo-dark.png">
    <img src="https://raw.githubusercontent.com/Pushpraj-10/cortex/main/docs/assets/logo.png" alt="Cortex" width="220">
  </picture>
</a>

### An AI coding agent, right in your terminal.

Local-first. Works with **Ollama**, **Google Gemini** and **Anthropic**. Edits your project through sandboxed tools, and asks before it does anything risky.

[![npm](https://img.shields.io/npm/v/@pushpraj_10/cortex?color=F8333C&label=npm)](https://www.npmjs.com/package/@pushpraj_10/cortex)
[![license](https://img.shields.io/badge/license-MIT-F8333C)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A522.12-F8333C)](https://nodejs.org)
[![typescript](https://img.shields.io/badge/built%20with-TypeScript-F8333C)](https://www.typescriptlang.org)

[Install](#-install) · [Features](#-features) · [Usage](#-usage) · [Configuration](#%EF%B8%8F-configuration) · [Architecture](#-architecture) · [Contributing](#-development)

<img src="https://raw.githubusercontent.com/Pushpraj-10/cortex/main/docs/assets/tui.png" alt="Cortex running in a terminal" width="860">

</div>

<br>

## 🚀 Install

```bash
npm install -g @pushpraj_10/cortex
cd your-project
cortex
```

That opens the full-screen terminal UI on the current folder. On first run, type `/provider`, pick a provider, and paste an API key (typed hidden, never shown or logged). Or run a single prompt without the UI:

```bash
cortex -p "explain what src/index.ts does"     # the answer goes to stdout
```

> **Needs Node 22.12 or newer.** For Ollama, run `ollama serve`, pull a model that supports tool calling (for example `ollama pull llama3.1`), and set `OLLAMA_MODEL`.

## ✨ Features

- **Bring your own model.** Ollama on your machine, or Gemini and Anthropic in the cloud. Switch with `/provider` without restarting. Cloud providers are never chosen automatically, so a key exported for other tools can't start sending your code anywhere.
- **Safe by default.** Reads run freely; edits and shell commands ask first. Four [permission modes](#permission-modes), allow and deny rules, and hooks that can block an action.
- **Understands your project.** Name a file in your message and the agent is handed that file, its imports and tests, and what imports it. Type `@` to pick a file from a menu.
- **A terminal UI that gets out of the way.** Streaming replies, syntax-highlighted code, readable diffs, expandable tool calls, a pinned input box, and a scrollable transcript (mouse wheel, `page up` / `page down`).
- **Extensible.** Plug in [MCP servers](#%EF%B8%8F-configuration), write skills the model loads on demand, and keep project notes in `CORTEX.md`.
- **Remembers what you said.** Messages are saved per project (`↑` to recall, `ctrl+r` to search). API keys never are.
- **Open and model-driven.** No fixed analyze / plan / implement stages: each turn is shaped by the context the model is given and the tools it chooses to call.

## 🧭 Usage

### Commands

| Command | What it does |
| --- | --- |
| `/help` | commands and keyboard shortcuts |
| `/clear` | start a new conversation |
| `/mode [name]` | show or set the permission mode |
| `/agent [name]` | show or switch the agent: `scan`, `suggest`, `fix` (see [Security agents](#security-agents)), or `off` for the general agent |
| `/provider [name]` | set up a provider's API key and model, and switch to it (`/provider remove <name>` forgets it) |
| `/model` | show the active model and provider |
| `/theme [name]` | show or switch the color theme (`dark`, `light`, `mono`); remembered in `~/.cortex/preferences.json`, and `NO_COLOR` always forces `mono` |
| `/quit` | exit |

### Keys

| Key | Action |
| --- | --- |
| `enter` | send |
| `shift+enter`, or `\` then `enter` | new line |
| `shift+tab` | cycle the permission mode |
| `esc` | interrupt the agent |
| `ctrl+t` | expand the last tool call |
| `?` (empty box) | show the shortcuts |
| `ctrl+c` | quit |
| `@` + letters | pick a file from a menu (`tab` or `enter` fills in its path) |
| `↑` / `↓` | move between lines, then recall earlier messages |
| `ctrl+r` | search earlier messages (`enter` loads the match into the box; it never sends it) |
| mouse wheel, `page up` / `page down` | scroll the conversation, any time, even while the agent works; sending a message jumps back to the end |
| `ctrl`/`alt` + arrows, `home` / `end`, `ctrl+a` / `ctrl+e`, `ctrl+w`, `ctrl+u`, `ctrl+k` | edit like a shell |

With the mouse wheel on, hold `shift` to select text with the mouse.

Messages are remembered between sessions, per project, in `~/.cortex/history/` (plain text, readable by you only, the last 500). Blank or very long messages are not saved, and nothing you enter in `/provider`, such as an API key, ever is.

### Flags

| Flag | Meaning |
| --- | --- |
| `--mode <mode>` | set the permission mode |
| `--agent <name>` | start as an agent: `scan`, `suggest` or `fix` |
| `-p <prompt>` | run one prompt without the UI: tool calls go to stderr, the answer to stdout, and anything needing approval is refused unless the mode or a rule allows it |
| `-h`, `--help` | show usage |

### Security agents

`/agent` gives Cortex a role with its own instructions and a limit on its tools that is enforced, not just prompted. Run them in order; each saves a report in `.cortex/security/` that the next one reads, so you can review in between.

| Agent | Does | Can use | Saves |
| --- | --- | --- | --- |
| `scan` | finds security vulnerabilities (injection, auth, secrets, path traversal, SSRF, weak crypto, vulnerable dependencies, ...) | read tools only | `scan.md` |
| `suggest` | proposes a fix for each finding, with trade-offs and a priority order | read tools only | `suggestions.md` |
| `fix` | applies the fixes, then runs the project's tests | read, edit and run tools | `fixes.md` |

The agent is separate from the permission mode, which still applies: `fix` in `plan` mode cannot edit, and `fix` asks before each edit unless the mode allows it. Saving a report is an edit, so `scan` and `suggest` ask once to save theirs (or use `acceptEdits`, which is safe for them because they can edit nothing else). In a one-shot run, use `cortex --agent scan --mode acceptEdits -p "audit src/"`.

### Permission modes

| Mode | Reads | Edits | Commands |
| --- | --- | --- | --- |
| `default` | run | ask | ask |
| `acceptEdits` | run | run | ask |
| `plan` | run | denied | denied |
| `bypassPermissions` | run | run | run |

Deny rules always win, even in `bypassPermissions`.

## ⚙️ Configuration

**Provider.** `CORTEX_PROVIDER` picks `ollama`, `google` or `anthropic`; if it is unset, Ollama is used. Each provider needs its model variable (`OLLAMA_MODEL`, `GOOGLE_MODEL`, `ANTHROPIC_MODEL`) and, for the cloud ones, a key (`GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`). See [`.env.example`](.env.example).

<details>
<summary><b>Setting up a provider from the app</b> (no environment files needed)</summary>

<br>

Run `cortex`, type `/provider`, pick a provider and answer two questions. The API key is typed hidden, and never shown, logged or added to the conversation. It is saved and used straight away, and remembered next time. If nothing is configured yet the app still opens and tells you to do this.

- **Where:** `~/.cortex/credentials.json` in your home directory, never in the project, so it can't be committed. It is written readable by you only (on Windows it relies on your user profile's folder permissions) and it is **plain text**, so prefer an environment variable if that doesn't suit you.
- **Precedence:** a set environment variable (`GOOGLE_API_KEY`, `CORTEX_PROVIDER`, …) beats what is saved, and the app tells you when one is overriding what you just entered. An empty variable counts as unset.
- **Forgetting:** `/provider remove <name>` deletes a provider's saved settings; or delete the file.

</details>

<details>
<summary><b>Settings, permissions, hooks and MCP servers</b> (<code>.cortex/settings.json</code>)</summary>

<br>

`.cortex/settings.json` in the project and `~/.cortex/settings.json` for you are merged. A malformed file is an error, not silently ignored.

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

</details>

<details>
<summary><b>Memory and skills</b></summary>

<br>

- **Memory:** `CORTEX.md` in the project (and `~/.cortex/CORTEX.md`) is added to the system prompt.
- **Skills:** `.cortex/skills/<name>/SKILL.md` with `name` and `description` frontmatter. Only the name and description sit in the prompt; the model loads the body with the `skill` tool when it needs it.

</details>

## 🧱 Architecture

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

## 🛠 Development

```bash
git clone https://github.com/Pushpraj-10/cortex.git
cd cortex
npm install
cp .env.example .env      # set OLLAMA_MODEL (local), or a cloud key + model
npm run dev               # full-screen terminal UI
npm run dev -- -p "explain what src/index.ts does"
npm run build             # bundle the installable package into apps/cli/dist
```

```bash
npm run typecheck        # tsc --build across every package and tests/
npm test                 # all unit tests plus the architecture test
npm run test:packages    # each package's tests in isolation (also: npm test -w @cortex/policy)
npm run test:e2e         # live-model scripts in tests/ (needs Ollama running)
```

Conventions: related small things live in one commented file per feature rather than one function per file, and each package's `test/` mirrors its `src/`. Commit messages follow [CLAUDE.md](CLAUDE.md).

> **Known limit:** `run_command` is gated only by approval, not sandboxed.

## ⭐ Support

If Cortex is useful to you, a star on [GitHub](https://github.com/Pushpraj-10/cortex) goes a long way. Issues and ideas are welcome at [Pushpraj-10/cortex/issues](https://github.com/Pushpraj-10/cortex/issues).

## 🙏 Acknowledgements

The terminal UI's markdown, code and tool-call presentation was designed after studying [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Apache-2.0), which is also built on Ink. The parsers and components here are written from scratch for Cortex's structure; no code was copied.

## 📄 License

[MIT](LICENSE) © Pushpraj-10
