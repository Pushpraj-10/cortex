/**
 * @cortex/agent — the chat + native-tool-calling loop that drives a coding session.
 * Wires @cortex/llm (the model), @cortex/tools (what it can do), and @cortex/prompts
 * (its system prompt) together; nothing here talks to a specific provider or tool.
 */

// Shared types
export type { AgentConfig, AgentEvent, AgentSession, Executor } from "./types.js";

// Core session & loop
export { createAgentSession } from "./core/agent-session.js";
export { runToolLoop, type ToolLoopDeps } from "./core/tool-loop.js";
export { createToolsExecutor } from "./core/tools-executor.js";
export { toToolSpec } from "./core/to-tool-spec.js";
