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
| `cli/` | how the process is driven from the command line | `args.ts` (flags), `env.ts` (`.env` loading; real environment variables win), `run-once.ts` (the `-p` path: only the final answer goes to stdout; tool calls and what the model said on the way to them go to stderr, and text is not streamed because a piped answer is only known to be the answer once no tool call follows it), `version.ts` (the version shown in the header) |
| `runtime/` | building the agent stack, and the seam to the UI | `bootstrap.ts` (the composition root: registers providers, tools and context providers; loads settings, memory, skills and MCP servers; builds the shared `AgentPolicy` and sessions), `permission-bridge.ts` (how the agent's approval request reaches the UI and back) |
| `provider/` | choosing and configuring the LLM provider; no React, no Ink | `config.ts` (picks the provider and resolves its config from the environment, with saved settings layered underneath; empty values count as unset), `manager.ts` (the running app's provider: a delegating client, what is saved, and `configure` / `remove` that save and switch without a restart; nothing it returns contains a key), `setup.ts` (the `/provider` questions and the pure state machine that walks them) |
| `format/` | how tool calls and markdown are described; shared by `cli/` and `ui/` | `tool-calls.ts` (summaries from each tool's own `summarize`, the tool's own `preview` fetched before it runs, status of a result, durations, result text, failure detection), `diff.ts` (a line diff with line numbers: trims what the texts share, LCS on the changed middle, caps its work, collapses far-away unchanged lines into gaps), `markdown.ts` (block parser: headings, nested/ordered/task lists, quotes, fenced code, tables, rules; tolerant of text still streaming in), `inline.ts` (bold, italic, strike, code, links and bare URLs as styled runs), `table.ts` (column fitting, cell wrapping, box borders and display width, as pure functions), `highlight.ts` (code to lines of scoped runs through `lowlight`; no language guessing) |
| `ui/` | everything that draws the screen or handles keys | `App.tsx` (composes the screen, handles keys), `commands.ts` (slash commands, pure logic over a `CommandHost`), `layout.ts` (rows left for the transcript), `types.ts` (transcript entries) |
| `ui/theme/` | colors and words, in one place | `themes.ts` (semantic color tokens and the `dark` / `light` / `mono` themes; `NO_COLOR` forces mono), `ThemeContext.ts` (`useTheme()`; components never hardcode a color), `copy.ts` (taglines, hints, tips, fixed sizes). The palette is deliberately quiet: two soft brand colors (`primary` dusty blue, `secondary` sage), neutral greys (`muted`, `border`, and a lifted `inputBackground`), and `status` / `diff` / `syntax` colors drawn from the same hues. The theme tests enforce WCAG AA contrast for every text color and keep every coloured token below 60% saturation (the brand colors below 50%), so a future tweak cannot drift back to neon |
| `ui/logo/` | the emblem and the wordmark | `emblem-art.ts` (**generated**: the logo as braille, 8 dots per cell), `emblem-layout.ts` (picks large / medium / wordmark-only by terminal size), `Emblem.tsx` (draws it in the primary color), `pixel-logo.ts` (the CORTEX wordmark: a 5x7 bitmap font packed two pixels per cell with half-blocks, in three widths), `Logo.tsx` (draws the wordmark in the primary color) |
| `ui/toolcalls/` | tool calls in the transcript and the approval prompt | `ToolCall.tsx` (a header with status glyph, `+3 -1` and duration, then an edit's diff, a command's output, or why a call did not go through), `Preview.tsx` (draws a diff with line numbers, signs, background bands and syntax colors, or a command; can pin every line to one row), `preview-model.ts` (pure: the cached diff, change counts, and the exact row count a preview takes) |
| `ui/markdown/` | drawing markdown | `Markdown.tsx` (block layout: headings, hanging-indent lists, quotes, rules, spacing; finished blocks never re-render while a later one streams), `CodeBlock.tsx` (light bracket and theme syntax colors), `Table.tsx` (boxed, fitted to the width), `Inline.tsx` (styled runs, links with their URL) |
| `ui/components/` | the pieces on screen | `Banner`, `InputBox` (a rule above and below with a lifted band between, a grey `>` and a block cursor, a dimmed `Try "…"` example when empty; can mask a secret), `StatusLine` (`? for shortcuts`, or the permission mode when it is not the default, on the left; the model and folder on the right), `Messages` (messages, tool calls, notices, the scrolling viewport), `Prompts` (the approval prompt and the `/provider` question), `SlashCommandMenu` (also the provider picker), `ThinkingIndicator` |
| `ui/hooks/` | state behind the components | `useChat` (transcript, cancel, expanded tool calls, one live assistant message that grows as text streams in (first piece at once, the rest batched every 50 ms, replaced by the exact final text; an interrupted reply keeps what was written), and each tool call's life: preview taken before it runs, awaiting approval, then success, error, declined or interrupted), `useTextInput` (input state, with the pure text-editing functions beside it), `useInputHistory` (up/down recall), `useProviderSetup` (drives the `/provider` flow), `terminal` (alt screen and size), `animation` (spinner, verb, elapsed time) |

`emblem-art.ts` comes from the logo image through `tools/make-logo.mjs` (`node apps/cli/tools/make-logo.mjs logo.png`, or `--preview` to see the dot grids first). It finds the bright strokes, fits the shape into a grid of braille dots (2x4 per cell, so a line can be a dot thick), and lights a dot when enough of its patch of the image is stroke. Re-run it only when the logo changes; nothing at runtime reads an image, and the tool decodes the PNG with `node:zlib`, so it needs no dependency.

Tests mirror `src/`: `test/<folder>/<file>.test.ts` (the text-editing functions are tested in `test/ui/hooks/useTextInput.test.ts`). Component tests (`*.test.tsx`) render through Ink into a fake terminal with `test/ui/support/render-frame.tsx` and assert on the plain-text frame.

The full-screen layout is a fixed-height column: a bottom-anchored transcript (clipped by `overflow="hidden"`, so the newest content stays visible), the thinking line or approval prompt, the slash menu when open, the input box, and the status line (model, mode, directory).

Tests: `npm test -w @cortex/cli`. The UI components are covered through the pure modules they use (layout, text editing, commands, formatting); the interactive screen needs a real terminal and is exercised by hand and by `npm run test:e2e:cli` against a live model.
