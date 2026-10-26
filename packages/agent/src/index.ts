/**
 * @cortex/agent — the chat + native-tool-calling loop that drives a coding session. It wires
 * @cortex/providers (the model), @cortex/tools (what it can do), @cortex/context (what it is told)
 * and @cortex/policy (what it may do); nothing here talks to a specific provider or tool.
 */

export type { AgentConfig, AgentEvent, AgentPolicy, AgentSession, Executor } from "./types.js";
export {
  AGENT_MODE_IDS,
  getAgentMode,
  isAgentModeId,
  listAgentModes,
  type AgentMode,
  type AgentModeId,
} from "./agent-modes.js";
export { createAgentSession } from "./session.js";
export { createToolsExecutor } from "./executor.js";
export { createTaskTool, TASK_TOOL_NAME } from "./subagent.js";
export { LLM_ERROR_PREFIX } from "./loop.js";
