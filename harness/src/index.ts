// Public API of the harness, for embedding it without the CLI.
export { runAgent } from "./agent/run-agent";
export type { AgentEvent, AgentOptions, AgentResult } from "./agent/types";
export { createAnthropicProvider } from "./llm/anthropic-provider";
export type { ContentBlock, LlmProvider, Message } from "./llm/types";
export { builtinTools } from "./tools/builtin-tools";
export type { ToolContext, ToolDef } from "./tools/types";
export type { HookDef } from "./hooks/types";
export type { PermissionMode, PermissionRules } from "./permissions/types";
export { createTaskTool } from "./subagents/create-task-tool";
export { createSkillTool } from "./skills/create-skill-tool";
export { loadSkills } from "./skills/load-skills";
export { connectMcpServer } from "./mcp/connect-mcp-server";
