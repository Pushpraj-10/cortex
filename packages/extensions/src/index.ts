/**
 * @cortex/extensions — ways to extend what the agent can do without changing it: skills (instruction
 * packs loaded on demand) and MCP servers (external tools).
 */

export { createSkillTool, loadSkills, parseSkill, renderSkillIndex, type Skill } from "./skills.js";
export { connectMcpServer, type McpConnection, type McpServerConfig } from "./mcp.js";
