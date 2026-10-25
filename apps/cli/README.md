# @cortex/cli

The terminal app: an [Ink](https://github.com/vadimdemedes/ink) UI over `@cortex/agent`, and the **composition root** — `src/bootstrap.ts` is the one place that knows every package and wires them together. Everything else here is small and single-purpose.

## Running

```
npm run dev                          # full-screen UI (needs a real terminal)
npm run dev -- --mode plan           # start in a permission mode
npm run dev -- -p "explain src/a.ts" # one shot: answer on stdout, tool calls on stderr
```

Configuration comes from the environment or a `.env` in the working directory; see the root `.env.example` and README. In `-p` runs nobody can approve a call, so anything that needs approval is refused (with a hint) unless `--mode` or an allow rule covers it. To use it as a command, `npm link` in this folder (`bin.cortex` runs `src/index.ts` through `tsx`).

In the UI: `/help`, `/clear`, `/mode`, `/model`, `/quit`; `enter` sends, `shift+enter` newline, `shift+tab` cycles the permission mode, `esc` interrupts (a real `AbortSignal` down to the HTTP request), `ctrl+t` expands the last tool call, `ctrl+c` quits. When the agent needs approval a prompt takes over: `y`/`enter` allows, `n`/`esc` refuses.

## Structure

| File | Role |
| --- | --- |
| `index.ts` | entry: parse flags, load `.env`, bootstrap, then render the UI or run one shot |
| `args.ts` · `env.ts` | command-line flags; `.env` loading (real environment variables win) |
| `provider-config.ts` | picks the provider from the environment and resolves its config |
| `bootstrap.ts` | registers providers, tools and context providers; loads settings, memory, skills and MCP servers; builds the shared `AgentPolicy` and sessions |
| `run-once.ts` | the `-p` path |
| `commands.ts` | slash commands — pure logic over a `CommandHost` |
| `permission-bridge.ts` | how the agent's approval request reaches the UI and back |
| `App.tsx` | composes the screen from the hooks below and handles keys |
| `hooks/useChat.ts` | the transcript, cancel, pending approval, expanded tool calls |
| `hooks/useTextInput.ts` · `text-edit.ts` | input state over pure editing functions |
| `hooks/useInputHistory.ts` · `terminal.ts` · `animation.ts` | up/down recall; alt screen and size; spinner, verb and elapsed time |
| `layout.ts` | the vertical layout math: rows left for the transcript |
| `components/` | `Banner`, `InputBox`, `Messages` (messages, tool calls, notices, the scrolling viewport), `Markdown`, `PermissionPrompt`, `SlashCommandMenu`, `StatusLine`, `ThinkingIndicator` |
| `format/markdown.ts` · `format/tool-calls.ts` | markdown parsing; tool-call summaries (from each tool's own `summarize`), result detail, failure detection |
| `theme.ts` | colors and copy — retheme here |

The full-screen layout is a fixed-height column: a bottom-anchored transcript (clipped by `overflow="hidden"`, so the newest content stays visible), the thinking line or approval prompt, the slash menu when open, the input box, and the status line (model, mode, directory).

Tests: `npm test -w @cortex/cli`. The UI components are covered through the pure modules they use (layout, text editing, commands, formatting); the interactive screen needs a real terminal and is exercised by hand and by `npm run test:e2e:cli` against a live model.
