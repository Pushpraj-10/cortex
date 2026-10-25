/**
 * @cortex/config — what the user has configured: layered settings (permissions, hooks, MCP servers)
 * and the markdown memory files that go into the system prompt.
 */

export { loadSettings, type Settings } from "./settings.js";
export { loadMemory } from "./memory.js";
