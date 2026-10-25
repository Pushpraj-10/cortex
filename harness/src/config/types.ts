import type { HookDef } from "../hooks/types";
import type { McpServerConfig } from "../mcp/types";
import type { PermissionMode, PermissionRules } from "../permissions/types";

export interface Settings {
  permissions: PermissionRules & { defaultMode?: PermissionMode };
  hooks: HookDef[];
  mcpServers: Record<string, McpServerConfig>;
}
