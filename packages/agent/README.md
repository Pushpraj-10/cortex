# @cortex/agent

The deep module that owns the agent loop: `Prompt -> Agent(Planning, Context
Building, Reasoning, Tool Calls) -> task completion`, and nothing else. It composes
`@cortex/llm` (talk to the model), `@cortex/context` (assemble what the model sees),
`@cortex/prompts` (render what to say), `@cortex/tools`/`@cortex/execution` (act on
what the model asks for) — with `@cortex/planner` wired in as a capability the loop
calls on, not a stage it must pass through.

An earlier version of this package also drove `/review` and `/fix` security
workflows, composed with `@cortex/security` and `@cortex/verification`. Both were
removed entirely (not just unwired) to shrink the codebase down to the core loop
above, since that's what needed debugging — see the root `README.md`.

The chat loop stays open-ended: what happens on a given turn is driven by the
context assembled and the model's own output, never a hardcoded
analyze-then-plan-then-implement pipeline baked into this package. If a future
capability feels missing, the fix is a better context provider or tool, not a new
required step in `modes/chat.ts`.

## API

- `createAgentSession(config)` — the real entry point. `AgentConfig` is
  `{ llm, executor, cwd, contextProviders?, planner? }`; any given `contextProviders`
  are registered into `@cortex/context`'s registry once, here (not auto-registered
  on import, same stance as every registry in this codebase). Returns `{ chat }`.
- `AgentEvent` — `message` | `toolCall` | `toolResult`.
- `runChat(userInput, config)` — assembles context, asks the (purely advisory)
  planner for a `TaskPlan`, then runs the tool-use loop until the model gives a final
  answer. The plan is built once and threaded into every turn as context.

## The tool-use loop (`src/internal/runToolLoop.ts`)

Tool calls are native, not JSON-in-text. Every registered `@cortex/tools` definition
is offered to the model as a `ToolSpec` (`toToolSpec`, via `@cortex/llm`'s
`LLMRequest.tools`); the model's response carries structured `toolCalls` when it
wants to invoke one (run via the configured `Executor`, result fed back, asked
again), or plain `content` when it's giving its final answer, which ends the turn.
This is what `runChat` runs on.

This replaced a prompt-and-parse protocol (`parseAgentAction`/`findJsonObjects`,
instructing the model to respond with exactly one hand-rolled JSON object per turn)
that, even hardened across two sessions — a balanced-brace scanner tolerant of
surrounding prose, then a `parseError`/retry loop for JSON that was clearly an
attempted action but malformed — remained a proven, recurring source of format
failures: a stray quote breaking a JSON string, a model narrating several actions in
prose instead of one structured call. Native tool-calling removes that whole failure
class structurally, since there is no free text left to fail to parse. Confirmed
directly against a live `llama3.1:8b` via Ollama's `/api/chat` `tools` field before
this replaced the old protocol.

### The situation block

Every turn, the loop appends one freshly-built block (`buildSituationBlock`) holding
the goal, the plan, the constraints learned so far, and the files changed so far. It
is rebuilt rather than appended to the transcript, so exactly one copy exists and it
always sits last — a trail of stale copies would grow without bound and leave the
model reading contradictory older versions of its own goal.

This is context, not control flow: the loop stays open and model-driven, and nothing
enforces that the plan's steps are followed in order or at all. It exists because the
loop was otherwise purely reactive — goal plus transcript, one action, repeat — with
nothing the model could check itself against. A real session asked to comment
`main.py` ended up writing a different file and declaring success.

Two details are load-bearing:

- **The block is sent as a `user` message, not `system`.** Verified against a live
  llama3.1:8b: a request whose final message is a system message comes back empty
  (`[system, user]` answered "4"; the same pair plus a trailing system message
  returned `""`), which silently ended the turn before a single tool ran.
- **Constraints are keyed by the error's class** (`ExecutionResult.errorName`), not
  its text. The message embeds the offending arguments, so the same mistake made with
  two different arguments would otherwise register as two separate lessons — and
  `createRepeatedCallGuard`'s exact-signature blocking already misses that case,
  which is exactly what constraints exist to cover.

## Known MVP limitations

- Learned constraints only cover tools that *throw*. `run_command` deliberately
  reports a non-zero exit as data (`{ exitCode: 128 }`) rather than an error, since a
  failing test suite is a legitimate result and not a tool malfunction — but that
  means `ExecutionResult.success` is `true`, so neither the repeat guard nor the
  constraint memory learns from a command that keeps failing. Observed live: a model
  re-ran `git add` against a non-repository three times in a row with nothing pushing
  back, and separately re-ran an identical successful `git diff` four times in a row.
  Fixing this needs a rule for which repeats are wasteful even when they "succeed,"
  which is a real judgment call rather than an oversight.
