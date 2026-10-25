import type { AgentOptions } from "../agent/types";
import { loadSettings } from "../config/load-settings";
import { buildSystemPrompt } from "../context/build-system-prompt";
import { loadMemory } from "../context/load-memory";
import { createAnthropicProvider } from "../llm/anthropic-provider";
import { connectMcpServer } from "../mcp/connect-mcp-server";
import type { McpConnection } from "../mcp/types";
import type { PermissionMode } from "../permissions/types";
import { createSkillTool } from "../skills/create-skill-tool";
import { loadSkills } from "../skills/load-skills";
import { renderSkillIndex } from "../skills/render-skill-index";
import { createTaskTool } from "../subagents/create-task-tool";
import { builtinTools } from "../tools/builtin-tools";
import { printEvent } from "./print-event";

export interface Harness {
  defaultMode: PermissionMode;
  /** Builds the options for one run; cheap, so the REPL can call it per prompt to pick up mode changes. */
  configure(mode: PermissionMode): AgentOptions;
  close(): void;
}

/** Composition root: the only place that knows about every module and wires them together. */
export async function bootstrap(
  cwd: string,
  askPermission: AgentOptions["askPermission"],
): Promise<Harness> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Set ANTHROPIC_API_KEY");

  const settings = await loadSettings(cwd);
  const skills = await loadSkills(cwd);
  const memory = await loadMemory(cwd);

  const mcp: McpConnection[] = [];
  for (const [name, cfg] of Object.entries(settings.mcpServers)) {
    try {
      mcp.push(await connectMcpServer(name, cfg, cwd));
    } catch (e) {
      console.error(`MCP server "${name}" failed to start: ${e instanceof Error ? e.message : e}`);
    }
  }

  const tools = [...builtinTools, ...mcp.flatMap((c) => c.tools), ...(skills.length ? [createSkillTool(skills)] : [])];
  const provider = createAnthropicProvider({ apiKey, model: process.env.CORTEX_MODEL ?? "claude-sonnet-5-5" });
  const skillIndex = renderSkillIndex(skills);

  return {
    defaultMode: settings.permissions.defaultMode ?? "default",
    configure(mode) {
      const opts: AgentOptions = {
        provider,
        system: buildSystemPrompt({ cwd, mode, memory, skillIndex }),
        tools,
        mode,
        rules: settings.permissions,
        hooks: settings.hooks,
        cwd,
        askPermission,
        onEvent: printEvent,
      };
      return { ...opts, tools: [...tools, createTaskTool(opts)] };
    },
    close: () => mcp.forEach((c) => c.close()),
  };
}
