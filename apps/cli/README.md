# @cortex/cli

The terminal app: an [Ink](https://github.com/vadimdemedes/ink) UI over `@cortex/agent`, and the **composition root** — `src/runtime/bootstrap.ts` is the one place that knows every package and wires them together. Everything else here is small and single-purpose.

## Running

```
npm run dev                          # full-screen UI (needs a real terminal)
npm run dev -- --mode plan           # start in a permission mode
npm run dev -- -p "explain src/a.ts" # one shot: answer on stdout, tool calls on stderr
npm run build                        # bundle the installable package into dist/ (see build.mjs)
```

Configuration comes from the environment or a `.env` in the working directory; see the root `.env.example` and README. In `-p` runs nobody can approve a call, so anything that needs approval is refused (with a hint) unless `--mode` or an allow rule covers it. To try it as a command from source, `npm link` in this folder (`bin.cortex` runs `src/index.ts` through `tsx`); users install the bundled package from `dist/` instead.

With nothing configured the UI still opens, and tells you to run `/provider` to enter an API key and model (see the root README for where they are saved). In the UI: `/help`, `/clear`, `/mode`, `/provider`, `/model`, `/theme`, `/quit`; `enter` sends, `shift+enter` newline, `shift+tab` cycles the permission mode, `esc` interrupts (a real `AbortSignal` down to the HTTP request), `ctrl+t` expands the last tool call, `ctrl+c` quits. When the agent needs approval a prompt takes over: `y`/`enter` allows, `n`/`esc` refuses.

## Structure

`src/` is the entry file plus five folders. Each folder is one job, and imports only flow downward (checked by `test/layering.test.ts`):

```
index.ts ─► cli/ ─► runtime/ ─► provider/        cli/ also uses format/
        └─► ui/  ─► provider/, format/           ui/ sees runtime/ for types only
```

| Folder | Job | Files |
| --- | --- | --- |
| `index.ts` | the entry: parse flags, load `.env`, bootstrap, then render the UI or run one shot | |
| `cli/` | how the process is driven from the command line | `args.ts` (flags), `env.ts` (`.env` loading; real environment variables win), `run-once.ts` (the `-p` path), `version.ts` (the version shown in the header) |
| `runtime/` | building the agent stack, and the seam to the UI | `bootstrap.ts` (the composition root: registers providers, tools and context providers; loads settings, memory, skills and MCP servers; builds the shared `AgentPolicy` and sessions), `permission-bridge.ts` (how the agent's approval request reaches the UI and back) |
| `provider/` | choosing and configuring the LLM provider; no React, no Ink | `config.ts` (picks the provider and resolves its config from the environment, with saved settings layered underneath; empty values count as unset), `manager.ts` (the running app's provider: a delegating client, what is saved, and `configure` / `remove` that save and switch without a restart; nothing it returns contains a key), `setup.ts` (the `/provider` questions and the pure state machine that walks them) |
| `format/` | how tool calls and markdown are described; shared by `cli/` and `ui/` | `tool-calls.ts` (summaries from each tool's own `summarize`, result detail, failure detection), `markdown.ts` (block parser: headings, nested/ordered/task lists, quotes, fenced code, tables, rules; tolerant of text still streaming in), `inline.ts` (bold, italic, strike, code, links and bare URLs as styled runs), `table.ts` (column fitting, cell wrapping, box borders and display width, as pure functions), `highlight.ts` (code to lines of scoped runs through `lowlight`; no language guessing) |
| `ui/` | everything that draws the screen or handles keys | `App.tsx` (composes the screen, handles keys), `commands.ts` (slash commands, pure logic over a `CommandHost`), `layout.ts` (rows left for the transcript), `types.ts` (transcript entries) |
| `ui/theme/` | colors and words, in one place | `themes.ts` (semantic color tokens and the `dark` / `light` / `mono` themes; `NO_COLOR` forces mono), `ThemeContext.ts` (`useTheme()`; components never hardcode a color), `gradient.ts` (pure hex blending), `copy.ts` (taglines, hints, tips, fixed sizes) |
| `ui/logo/` | the wordmark | `pixel-logo.ts` (a 5x7 bitmap font packed two pixels per cell with half-blocks, in three widths), `Logo.tsx` (colors it along the theme gradient) |
| `ui/markdown/` | drawing markdown | `Markdown.tsx` (block layout: headings, hanging-indent lists, quotes, rules, spacing; finished blocks never re-render while a later one streams), `CodeBlock.tsx` (light bracket and theme syntax colors), `Table.tsx` (boxed, fitted to the width), `Inline.tsx` (styled runs, links with their URL) |
| `ui/components/` | the pieces on screen | `Banner`, `InputBox` (can mask a secret), `Messages` (messages, tool calls, notices, the scrolling viewport), `Prompts` (the approval prompt and the `/provider` question), `SlashCommandMenu` (also the provider picker), `StatusLine`, `ThinkingIndicator` |
| `ui/hooks/` | state behind the components | `useChat` (transcript, cancel, pending approval, expanded tool calls), `useTextInput` (input state, with the pure text-editing functions beside it), `useInputHistory` (up/down recall), `useProviderSetup` (drives the `/provider` flow), `terminal` (alt screen and size), `animation` (spinner, verb, elapsed time) |

Tests mirror `src/`: `test/<folder>/<file>.test.ts` (the text-editing functions are tested in `test/ui/hooks/useTextInput.test.ts`). Component tests (`*.test.tsx`) render through Ink into a fake terminal with `test/ui/support/render-frame.tsx` and assert on the plain-text frame.

The full-screen layout is a fixed-height column: a bottom-anchored transcript (clipped by `overflow="hidden"`, so the newest content stays visible), the thinking line or approval prompt, the slash menu when open, the input box, and the status line (model, mode, directory).

Tests: `npm test -w @cortex/cli`. The UI components are covered through the pure modules they use (layout, text editing, commands, formatting); the interactive screen needs a real terminal and is exercised by hand and by `npm run test:e2e:cli` against a live model.
