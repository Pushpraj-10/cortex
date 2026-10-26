# @cortex/agent

The chat + native-tool-calling loop that drives a coding session. It composes the model (`@cortex/providers`), what it can do (`@cortex/tools`), what it is told (`@cortex/context`) and what it may do (`@cortex/policy`); nothing here knows a specific provider or tool.

The loop is open and model-driven: no fixed stages. What happens on a turn comes from the context the model is given and the tools it chooses to call.

```ts
const executor = createToolsExecutor(cwd, policy);
const session = createAgentSession({ llm, executor, workspaceRoot: cwd, policy, memory, skillIndex });
for await (const event of session.chat("fix the parser", signal)) { /* message | messageDelta | toolCall | toolResult | context | compacted */ }
```

## A turn

1. `UserPromptSubmit` hooks may block it. The system message is re-rendered (so a mode change takes effect), the user message is added, and `@cortex/context` builds a context block.
2. The history is compacted if it has outgrown `contextBudgetTokens`: older turns are replaced by a model-written summary, keeping the system message and the recent turns (`compacted` event). Before each request a `context` event reports the estimated size of what is about to be sent and the budget (default 100,000), so a UI can show how full the conversation is.
3. The model replies, streamed when the provider can (`messageDelta` events as text arrives; a consumer may ignore them, because the same text follows whole in a `message` event). What the model says before a tool call is also yielded as a `message`, so it is part of what the user sees. Plain text ends the turn. A tool call is run — **one per turn**, so the model sees each real result before choosing the next action.
4. The executor runs it through the policy pipeline: the active agent mode's tool limit → `PreToolUse` hooks → permission decision (asking the user if needed) → the tool → `PostToolUse` hooks. A refusal or failure comes back as an error result whose message says what happened and what to do instead (recovery hints for missing paths, edit misses, and so on), so the model adapts instead of retrying blindly. An unknown tool is an error result listing the available tools, never a crash.
   The `toolResult` event carries `ok`, and `refused: true` when the call was stopped by a decision (the user declined, policy denied it, a hook blocked it) rather than failing, so a UI can tell "no" from "broke" without reading the message.
5. The result goes back into the history (oversized results are truncated) and the loop repeats, up to `maxIterations` (default 16). `Stop` hooks run at the end.

The context block is appended to each request as a trailing user message but never stored in the history, so stale copies do not pile up.

## Public API

| Export | Purpose |
| --- | --- |
| `createAgentSession(config)` | a conversation: `chat(input, signal)` yields events and keeps its history |
| `createToolsExecutor(cwd, policy?)` | runs tool calls from `@cortex/tools`' registry behind the policy pipeline; without a policy every call simply runs |
| `createTaskTool(deps)` | the `task` tool: delegate a job to a fresh subagent session that returns only its final answer (never offered to itself; its tool calls are gated by the same executor) |
| `AgentPolicy` | `mode`, `agent?`, `rules`, `hooks`, `askPermission` — one shared object, so the UI can change `mode` or `agent` between turns |
| `AGENT_MODE_IDS`, `getAgentMode`, `listAgentModes`, `isAgentModeId` | the built-in agent modes (below) |
| `LLM_ERROR_PREFIX` | the prefix of the message yielded when the model request fails, for UIs to classify |

`AgentConfig`: `llm`, `executor`, `workspaceRoot`, and optionally `maxIterations`, `policy`, `memory` (CORTEX.md text), `skillIndex`, `contextBudgetTokens` (default 100,000 estimated tokens), `excludeTools`.

## Agent modes

An agent mode (`policy.agent`) gives the agent a role: its instructions are added to the system prompt, and the tools it may use are limited by `kind`. The limit is enforced twice: the session offers the model only the allowed tools, and the executor refuses any other call with `TOOL_DENIED` (so a made-up call, or one from a `task` subagent, which shares the executor, is refused too). It is separate from the permission mode, which still applies: `fix` in plan mode cannot edit. Subagents get the limit but not the role's instructions. With no agent set, the general agent has no limit beyond the permission mode.

The built-in modes form a security pipeline. Each saves a report with `save_security_report` (`@cortex/tools`) that the next one reads:

| Agent | Tools | Reads | Writes |
| --- | --- | --- | --- |
| `scan` | read tools + the report tool | the code | `.cortex/security/scan.md` |
| `suggest` | read tools + the report tool | `scan.md` | `suggestions.md` |
| `fix` | read, edit and execute tools (still behind the permission mode) | `suggestions.md`, else `scan.md` | `fixes.md` |

## Files

`types.ts` · `session.ts` · `loop.ts` (the tool-use loop) · `executor.ts` (the policy pipeline and recovery hints) · `agent-modes.ts` (the modes and their tool limits) · `compaction.ts` · `system-prompt.ts` · `subagent.ts`

Tests: `npm test -w @cortex/agent`.
