# @cortex/extensions

Ways to extend what the agent can do without changing it: **skills** and **MCP servers**. Both surface to the agent as ordinary tools.

## Skills (`src/skills.ts`)

A skill is a folder `<name>/SKILL.md` with `name` and `description` frontmatter and instructions as the body:

```
---
name: review
description: Reviews a diff for bugs and style
---
Read the diff, then ...
```

Skills are loaded from `~/.cortex/skills/` and `<project>/.cortex/skills/`; the project wins on a name clash. Only `- name: description` lines go in the system prompt (`renderSkillIndex`); the body is returned by the `skill` tool (`createSkillTool`, kind `read`) when the model asks for it, so unused skills cost almost nothing.

## MCP (`src/mcp.ts`)

`connectMcpServer(name, { command, args, env }, cwd)` starts a stdio [MCP](https://modelcontextprotocol.io) server, performs the handshake, lists its tools and returns them as `ToolDefinition`s named `mcp__<server>__<tool>` plus a `close()`. MCP tools are kind `execute` — a server can do anything — so they always go through approval and are denied in plan mode. Errors a server reports become failed results carrying its message. Servers are declared in `.cortex/settings.json` under `mcpServers`.

## Files

`skills.ts` · `mcp.ts`. Depends on `@cortex/tools`.

Tests: `npm test -w @cortex/extensions` (the MCP tests run the real client against a small stdio fixture server in `test/fixtures/`).
