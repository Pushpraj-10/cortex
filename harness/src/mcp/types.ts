import type { ToolDef } from "../tools/types";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConnection {
  tools: ToolDef[];
  close(): void;
}
