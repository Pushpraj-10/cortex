# @cortex/cli

An [Ink](https://github.com/vadimdemedes/ink) (React for terminals) TUI, wired to the
real `@cortex/agent` stack: a local Ollama model, driving the 10 sandboxed
file-system tools in `@cortex/tools` through native tool-calling. `src/index.ts` is
the composition root — it registers the Ollama provider and every tool, builds an
`AgentSession` from env config, and hands it to `App` as a prop. Everything under
`src/components/`, `src/hooks/`, and `src/format/` is agent-agnostic — it only knows
about `TimelineEntry`/`AgentEvent` shapes, not about Ollama or the tools registry.

## Running it

Needs [Ollama](https://ollama.com) running locally with a tool-calling-capable model
pulled (`ollama pull llama3.1`). Set `OLLAMA_MODEL` (required — no default) and
optionally `OLLAMA_BASE_URL` (defaults to `http://localhost:11434`), either as real
env vars or in a `.env` file at the repo root (see `.env.example`).

```
npm run dev
```

Runs `apps/cli/src/index.ts` directly via `tsx` — needs a real terminal (TTY) for
keyboard input to work; piping stdin or running in a non-interactive shell will still
render but keystrokes won't register. If `OLLAMA_MODEL` isn't set, it fails fast with
a `console.error` before Ink takes over the terminal, rather than as in-TUI state.

To run it as a standalone `cortex` command:

```
cd apps/cli
npm link
cortex
```

`bin.cortex` points at `src/index.ts` with a `#!/usr/bin/env -S npx tsx` shebang, so
`npm link` gives you a working `cortex` binary with no build step — `tsx` (a
dependency of this package) transpiles on the fly. **Note:** `loadDotEnv()` reads
`.env` relative to `process.cwd()`, which for a globally-linked `cortex` is the
*user's* project directory, not this monorepo — export `OLLAMA_MODEL`/`OLLAMA_BASE_URL`
as real env vars for that case instead of relying on a `.env` file.

**Ctrl+C** exits. **Esc** while thinking aborts the in-flight request (a real
`AbortSignal`, threaded through `@cortex/llm`'s `fetch` call — not just a UI-level
"stop showing output"). **Ctrl+T** toggles the most recent tool-call block open/closed
(a stand-in for real per-item expand/collapse, until there's a focus-navigation
system).

## Structure → visual element

| File | Visual element |
|---|---|
| `src/theme.ts` | **Everything visual in one place**: the 5 colors, the banner ASCII art, tagline, placeholder text, status hint, thinking verbs. Retheme by editing this file only. |
| `src/components/Banner.tsx` | Startup wordmark box + tagline + cwd (element 1). Scrolls away naturally as conversation grows — it's just the first thing in the scrollable area, not pinned. |
| `src/components/InputBox.tsx` | The bordered, multi-line-capable input box at the bottom (element 2). Owns cursor positioning and the empty-state placeholder; doesn't own keystroke handling (see `App.tsx`). |
| `src/theme.ts` `colors` | The 5-color theme (element 3): `accent`, `muted`, `error`, `success`, `removed`. `error` renders a real `LLM request failed` message in red (see `src/format/classify-agent-message.ts`); `success`/`removed` are still unused — nothing here produces a diff view yet. |
| `src/components/ThinkingIndicator.tsx` + `src/hooks/useSpinnerFrame.ts` + `src/hooks/useRotatingVerb.ts` + `src/hooks/useElapsedTime.ts` | Spinner + rotating verb + elapsed seconds + fake token count, one line, in place (element 4). Stays active for the agent's *entire* multi-turn tool loop, not just the first model round-trip. |
| `src/components/StatusLine.tsx` | Footer line: model name, cwd, hint (element 5). |
| `src/components/MessageBubble.tsx` + `src/components/Markdown.tsx` | User (`>`-prefixed) vs. assistant (indented, unprefixed) message rendering, with a hand-rolled markdown renderer for `**bold**`, `` `code spans` ``, fenced code blocks, and `-`/`*` bullet lists (element 6). |
| `src/components/ToolCallBlock.tsx` | Collapsible-looking tool-call summary (`●`/`⏺` + one line, expands to a detail box) (element 7). Expand state lives in `App.tsx`, toggled with Ctrl+T — see "Known limitations". |
| `src/components/SlashCommandMenu.tsx` | Bordered, filterable, arrow-key-navigable `/command` popup (element 8) — still decorative, see "Known limitations". |
| `src/components/MessageList.tsx` | Renders one chronological `TimelineEntry[]` (messages and tool calls interleaved in the order they happened), inside the fixed-height "tail" viewport. |
| `src/format/summarize-tool-call.ts` | Maps a raw `(toolName, args)` tool call into the one-line collapsed summary (`Read src/index.ts`, `Move a.ts → b.ts`, ...). |
| `src/format/format-tool-result-detail.ts` | Formats a tool's output for the expanded `ToolCallBlock` detail view (pretty-printed JSON, truncated past ~2000 chars). |
| `src/format/classify-agent-message.ts` | Flags the one message `runToolLoop` yields on a failed LLM request, so `MessageBubble` can render it in `colors.error` — a deliberate string-prefix check confined to this package (see the file's own comment for why). |
| `src/wiring/*.ts` | The composition root's helpers: `.env` loading, LLM-provider/tool/context-provider registration, and `createCliAgentSession()` (builds the real `AgentSession`). Called once, from `index.ts`, before `render()`. `register-context-providers.ts` registers `@cortex/context`'s `workspaceOverviewProvider`, which feeds a directory listing + `package.json`/README summary into every turn. |
| `src/App.tsx` | Everything interactive: all keystroke handling (typing, backspace, arrows, history recall, Ctrl+C, Esc-to-abort), `submit()` draining `session.chat()`'s `AsyncGenerator<AgentEvent>` into `timeline` state event-by-event, and the fixed-height layout math that sizes the scrollable message viewport around whatever the input box/thinking line/slash menu currently need. |
| `src/hooks/useAltScreen.ts` | Switches into the terminal's alternate screen buffer on mount, restores it (and cursor visibility) on unmount/Ctrl+C/SIGTERM — this is what makes Cortex a full-screen fixed-height app instead of one that scrolls the normal terminal buffer. |
| `src/hooks/useTerminalSize.ts` | Tracks `columns`/`rows`, updated on resize — `App.tsx` uses `rows` to size the fixed-height root `Box`; `InputBox`'s border uses `width="100%"` so it resizes with the terminal automatically. |
| `src/hooks/useInputHistory.ts` | Up/down arrow recall through `mock/mockHistory.ts` — still mock, see "Known limitations". |

## How the fixed-height layout works

`App.tsx` renders one root `Box` at exactly `rows` tall: a scrollable message area on
top, then (conditionally) the thinking line, then the slash-command menu, then the
input box, then the status line — the last three are effectively "pinned to the
bottom" simply because they're the last things in a column layout that's exactly as
tall as the terminal.

The message area doesn't do manual line-counting/virtual scrolling. `MessageList`
wraps its (unbounded-height) content in a `Box` that has a fixed `height`,
`overflow="hidden"`, and `justifyContent="flex-end"`. Yoga (Ink's flex layout engine)
lays out the inner content at its natural height, and the fixed-height + flex-end
combination clips it from the *top* — so once there's more conversation than fits,
the newest messages stay visible and older ones scroll off, like `tail -f`, without
any manual line math. `InputBox` uses the identical trick to clip a very long
multi-line draft to `maxInputBoxLines`.

`App.tsx` computes how many rows are left for the message area by adding up exactly
what the other pinned pieces will render: input box lines (from `value`'s line count,
clamped to `maxInputBoxLines`) + 2 for its border, 1 for the thinking line if active,
the slash menu's height if open, and 1 for the status line. Because these numbers are
derived from the same state that determines what those components actually render,
they stay in sync without a DOM-measurement pass.

## How the agent wiring works

`session.chat(userInput, signal)` returns an `AsyncGenerator<AgentEvent>`. `App.tsx`'s
`submit()` drains it with `for await`, appending to `timeline` per event rather than
buffering to one final callback — `isThinking` is set once before the loop and
cleared once in a `finally` after the generator fully drains, so the spinner stays
active across the agent's entire multi-turn tool loop, not just the first model call.

`toolCall`/`toolResult` events arrive as two separate events with no shared id, but
`runToolLoop` (in `@cortex/agent`) is guaranteed to act on only one tool call at a
time, fully awaiting its execution before yielding the result — so pairing them via a
single "most recently pending" id, tracked locally inside `submit()`, is always
correct, not a heuristic.

Escape aborts the real in-flight request: `submit()` creates an `AbortController` per
call, passes `.signal` into `session.chat()`, and Escape calls `.abort()`. Since an
aborted request surfaces through `runToolLoop` as the same
`"LLM request failed: ..."` shape as a genuine failure, a `userCancelledRef` flag set
by the Escape handler makes the adapter skip appending that one trailing message
instead of showing a spurious error bubble.

## Known limitations

- **Slash commands are still decorative.** `/help`, `/clear`, `/model`, etc. only
  autofill the input box on selection — none of them execute anything.
- **Command history (`mock/mockHistory.ts`) is still mock data**, not persisted real
  history.
- **Shift+Enter for multi-line is best-effort.** Not all terminals report Shift+Enter
  as distinct from Enter. Alt/Option+Enter (`key.meta`) reliably inserts a newline;
  pasting multi-line text also works (it arrives as literal `\n` in the input, not as
  a keypress). Plain Enter always submits.
- **Tool-call expand/collapse is a stub interaction.** There's no focus-navigation
  system yet, so Ctrl+T toggles only the *last* tool-call block rather than letting
  you pick one.
- **Cancellation stops at the HTTP layer.** Escape aborts the Ollama `fetch` call, but
  the 10 file-system tool handlers don't pass `context.signal` into their own
  `fs.promises` calls, so an in-flight file operation isn't itself interrupted (file
  ops are fast enough that this is low-value in practice).
- **No streaming.** `@cortex/llm` is request/response, not token-by-token.
- **Only Ollama.** The provider registry supports adding more without changing this
  package's own code, but nothing else is registered yet.
- **No build step.** `bin.cortex` runs `src/index.ts` straight through `tsx`,
  consistent with the rest of this monorepo (see root `package.json`'s `dev` script).
