# @cortex/policy

What is allowed to happen during an agent turn: **permission modes and rules** decide whether a tool call runs, is refused, or needs approval, and **hooks** let the user veto or observe it. Decisions depend on a tool's `kind` (`read` / `edit` / `execute`), never its name, so adding a tool never means touching policy.

## Modes

| Mode | `read` | `edit` | `execute` |
| --- | --- | --- | --- |
| `default` | allow | ask | ask |
| `acceptEdits` | allow | allow | ask |
| `plan` | allow | deny | deny |
| `bypassPermissions` | allow | allow | allow |

Precedence: **deny rules** → `bypassPermissions` → `plan` → **allow rules** → reads → `acceptEdits` → ask. A deny rule beats everything, including `bypassPermissions`; `plan` ignores allow rules.

## Rules

`tool_name`, or `tool_name(pattern)` matched against the call's main argument (the command, else the path):

```
run_command                 any call of that tool
run_command(npm test)       exactly that command
run_command(npm test:*)     a command starting with "npm test"
read_file(src/*)            a path starting with "src/"
```

## Hooks

Shell commands registered per event: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`. A hook receives the event as JSON on stdin (`hook_event_name`, plus `tool_name`, `tool_input`, `tool_response` or `prompt`). **Exit code 2 blocks**, and its stderr is fed back to the model; any other exit code is ignored. `matcher` is a tool-name regex matched against the whole name. A hook that times out (60 s) or fails to start counts as not blocking.

## API

`decidePermission(tool, input, mode, rules)`, `matchRule`, `isPermissionMode`, `PERMISSION_MODES`, `runHooks(hooks, event, payload, cwd)`, and the types `PermissionMode`, `PermissionRules`, `Decision`, `HookDef`, `HookEvent`, `HookOutcome`.

## Files

`types.ts` · `permissions.ts` · `hooks.ts`. Depends on `@cortex/tools` for the `ToolKind` type only.

Tests: `npm test -w @cortex/policy`.
