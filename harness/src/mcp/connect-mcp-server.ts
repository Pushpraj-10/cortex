import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { ToolDef } from "../tools/types";
import type { McpConnection, McpServerConfig } from "./types";

interface RpcResponse {
  id?: number;
  result?: any;
  error?: { message: string };
}

/**
 * Minimal MCP client over stdio (newline-delimited JSON-RPC 2.0): initialize, tools/list, tools/call.
 * Tools are exposed as `mcp__<server>__<tool>`; MCP tools are never marked read-only, so they go through approval.
 */
export async function connectMcpServer(serverName: string, cfg: McpServerConfig, cwd: string): Promise<McpConnection> {
  const child: ChildProcessWithoutNullStreams = spawn(cfg.command, cfg.args ?? [], {
    cwd,
    env: { ...process.env, ...cfg.env },
    shell: process.platform === "win32",
  });
  const pending = new Map<number, (r: RpcResponse) => void>();
  let nextId = 1;

  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const msg = JSON.parse(line) as RpcResponse;
      if (msg.id !== undefined) pending.get(msg.id)?.(msg);
    } catch {
      /* ignore non-JSON output */
    }
  });
  child.on("exit", () => {
    for (const resolve of pending.values()) resolve({ error: { message: "MCP server exited" } });
  });

  const request = (method: string, params: unknown, timeoutMs = 30_000) =>
    new Promise<any>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), timeoutMs);
      pending.set(id, (r) => {
        clearTimeout(timer);
        pending.delete(id);
        r.error ? reject(new Error(r.error.message)) : resolve(r.result);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "cortex-harness", version: "0.1.0" },
  });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const listed = await request("tools/list", {});
  const tools: ToolDef[] = (listed.tools ?? []).map((t: any): ToolDef => ({
    name: `mcp__${serverName}__${t.name}`,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
    readOnly: false,
    async run(input) {
      const res = await request("tools/call", { name: t.name, arguments: input }, 120_000);
      const text = (res.content ?? []).map((c: any) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
      if (res.isError) throw new Error(text || "MCP tool error");
      return text;
    },
  }));

  return { tools, close: () => child.kill() };
}
