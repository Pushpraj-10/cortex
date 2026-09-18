# @cortex/cli

An [Ink](https://github.com/vadimdemedes/ink) (React for terminals) TUI. This is a
**visual prototype fed by mock data** — no `@cortex/agent`/`@cortex/llm`/`@cortex/tools`
wiring yet. The whole point of the split is that the UI shell and the real agent
logic can be built and changed independently: swapping mock data for a real
`AgentSession` later should only touch `App.tsx`'s state/submit logic, not any
component in `src/components/`.

## Running it

```
npm run dev
```

Runs `apps/cli/src/index.ts` directly via `tsx` — needs a real terminal (TTY) for
keyboard input to work; piping stdin or running in a non-interactive shell will still
render but keystrokes won't register.

To run it as a standalone `cortex` command:

```
cd apps/cli
npm link
cortex
```

`bin.cortex` points at `src/index.ts` with a `#!/usr/bin/env -S npx tsx` shebang, so
`npm link` gives you a working `cortex` binary with no build step — `tsx` (a
dependency of this package) transpiles on the fly.

**Ctrl+C** exits. **Ctrl+T** toggles the most recent tool-call block open/closed (a
stand-in for real per-item expand/collapse, until there's a focus-navigation system).

## Structure → visual element

| File | Visual element |
|---|---|
| `src/theme.ts` | **Everything visual in one place**: the 5 colors, the banner ASCII art, tagline, placeholder text, status hint, thinking verbs. Retheme by editing this file only. |
| `src/components/Banner.tsx` | Startup wordmark box + tagline + cwd (element 1). Scrolls away naturally as conversation grows — it's just the first thing in the scrollable area, not pinned. |
| `src/components/InputBox.tsx` | The bordered, multi-line-capable input box at the bottom (element 2). Owns cursor positioning and the empty-state placeholder; doesn't own keystroke handling (see `App.tsx`). |
| `src/theme.ts` `colors` | The 5-color theme (element 3): `accent`, `muted`, `error`, `success`, `removed`. `error`/`success` aren't wired to any UI yet since nothing in this mock produces errors or diffs — the tokens exist for when real tool output does. |
| `src/components/ThinkingIndicator.tsx` + `src/hooks/useSpinnerFrame.ts` + `src/hooks/useRotatingVerb.ts` + `src/hooks/useElapsedTime.ts` | Spinner + rotating verb + elapsed seconds + fake token count, one line, in place (element 4). |
| `src/components/StatusLine.tsx` | Footer line: model name, cwd, hint (element 5). |
| `src/components/MessageBubble.tsx` + `src/components/Markdown.tsx` | User (`>`-prefixed) vs. assistant (indented, unprefixed) message rendering, with a hand-rolled markdown renderer for `**bold**`, `` `code spans` ``, fenced code blocks, and `-`/`*` bullet lists (element 6). |
| `src/components/ToolCallBlock.tsx` | Collapsible-looking tool-call summary (`●`/`⏺` + one line, expands to a detail box) (element 7). Expand state lives in `App.tsx`, toggled with Ctrl+T — see "Known limitations". |
| `src/components/SlashCommandMenu.tsx` | Bordered, filterable, arrow-key-navigable `/command` popup (element 8). |
| `src/App.tsx` | Everything interactive: all keystroke handling (typing, backspace, arrows, history recall, Ctrl+C, Esc), submit → fake `setTimeout` "thinking" → stub response, and the fixed-height layout math that sizes the scrollable message viewport around whatever the input box/thinking line/slash menu currently need. |
| `src/hooks/useAltScreen.ts` | Switches into the terminal's alternate screen buffer on mount, restores it (and cursor visibility) on unmount/Ctrl+C/SIGTERM — this is what makes Cortex a full-screen fixed-height app instead of one that scrolls the normal terminal buffer. |
| `src/hooks/useTerminalSize.ts` | Tracks `columns`/`rows`, updated on resize — `App.tsx` uses `rows` to size the fixed-height root `Box`; `InputBox`'s border uses `width="100%"` so it resizes with the terminal automatically. |
| `src/hooks/useInputHistory.ts` | Up/down arrow recall through `mock/mockHistory.ts`. |
| `src/mock/*.ts` | All mock data: conversation seed, command history, slash commands, tool calls. Swap these (and the `setTimeout` stub in `App.tsx`'s `submit()`) for real data when wiring in the agent. |

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

## Known limitations

- **Pure UI, no real agent.** Every response is a canned `setTimeout` + a stub
  message. See `App.tsx`'s `submit()`.
- **Shift+Enter for multi-line is best-effort.** Not all terminals report Shift+Enter
  as distinct from Enter. Alt/Option+Enter (`key.meta`) reliably inserts a newline;
  pasting multi-line text also works (it arrives as literal `\n` in the input, not as
  a keypress). Plain Enter always submits.
- **Tool-call expand/collapse is a stub interaction.** There's no focus-navigation
  system yet, so Ctrl+T toggles only the *last* tool-call block rather than letting
  you pick one.
- **No streaming.** Not applicable yet since there's no real model call, but the
  eventual real wiring will need to decide how token-by-token output interacts with
  the fixed-height "tail" viewport.
- **No build step.** `bin.cortex` runs `src/index.ts` straight through `tsx`,
  consistent with the rest of this monorepo (see root `package.json`'s `dev` script).
