# cortex-harness

A small agent harness: the model drives an open loop, and everything around it (tools, permissions, hooks, subagents,
skills, MCP, compaction) is a separate module with one job.

```
ANTHROPIC_API_KEY=... npm start                 # REPL
ANTHROPIC_API_KEY=... npm start -- -p "prompt"  # one shot
npm start -- --mode plan                        # default | acceptEdits | plan | bypassPermissions
npm test && npm run typecheck
```

## Layout and dependency direction

Each folder owns its own contracts in `types.ts`. A folder may import only the folders listed in its row;
`test/architecture.test.ts` enforces this, so a wrong-way import fails the build.

| Folder         | Owns                                                                       | May import                                        |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `llm/`         | Message/content-block contract, provider interface, Anthropic client       | nothing                                           |
| `tools/`       | Tool contract and the built-in tools (Read, Write, Edit, Glob, Grep, Bash) | nothing                                           |
| `permissions/` | Modes, allow/deny rules, the decision function                             | nothing                                           |
| `hooks/`       | Hook contract and the command runner (exit code 2 blocks)                  | nothing                                           |
| `mcp/`         | Stdio MCP client; exposes servers' tools as `mcp__<server>__<tool>`        | `tools`                                           |
| `skills/`      | `SKILL.md` loading and the on-demand `Skill` tool                          | `tools`                                           |
| `context/`     | Compaction, token estimate, `CORTEX.md` memory, system prompt              | `llm`, `permissions`                              |
| `config/`      | Layered `settings.json` loading                                            | `hooks`, `mcp`, `permissions`                     |
| `agent/`       | The loop and the per-call pipeline (hooks, permission, tool, hooks)        | `context`, `hooks`, `llm`, `permissions`, `tools` |
| `subagents/`   | `Task` tool: the same loop on a fresh history                              | `agent`, `tools`                                  |
| `cli/`         | Composition root (`bootstrap`), REPL, argument parsing, printing           | everything                                        |

`src/index.ts` is the public API for embedding the harness without the CLI.

## Conventions

- One function per file, grouped by topic folder; tests live in `test/` mirroring `src/`.
- Tools signal failure by throwing. The agent turns that into an error result with a recovery hint
  (`agent/format-tool-error.ts`), so the model is told what to do next rather than left to retry blindly.
- The loop never branches on "stages". Behaviour comes from the context the model sees.

## Configuration

- `CORTEX.md` (project) and `~/.cortex/CORTEX.md` (user): instructions added to the system prompt.
- `.cortex/settings.json` (and `~/.cortex/settings.json`): `permissions.{allow,deny,defaultMode}`,
  `hooks[{event,matcher,command}]`, `mcpServers{name:{command,args,env}}`.
- `.cortex/skills/<name>/SKILL.md`: frontmatter `name`, `description`; the body loads only when the model calls `Skill`.
