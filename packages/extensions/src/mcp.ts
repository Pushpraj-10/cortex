/**
 * A minimal MCP (Model Context Protocol) client over stdio — newline-delimited JSON-RPC 2.0: initialize,
 * tools/list and tools/call. Each server tool becomes a ToolDefinition named `mcp__<server>__<tool>`.
 * MCP tools are `kind: "execute"`: the server can do anything, so they always go through approval.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { defineTool, type ToolDefinition } from "@cortex/tools";

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConnection {
  tools: ToolDefinition[];
  close(): void;
}

interface RpcResponse {
  id?: number;
  result?: unknown;
  error?: { message: string };
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpCallResult {
  content?: { type: string; text?: string }[];
  isError?: boolean;
}

const REQUEST_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 120_000;

/** Quotes an argument for the Windows shell, which spawn() needs for `.cmd` shims like npx. */
function quoteForShell(value: string): string {
  return /[\s()&^|<>"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function startServer(cfg: McpServerConfig, cwd: string): ChildProcessWithoutNullStreams {
  const options = { cwd, env: { ...process.env, ...cfg.env } };
  if (process.platform === "win32") {
    return spawn(quoteForShell(cfg.command), (cfg.args ?? []).map(quoteForShell), { ...options, shell: true });
  }
  return spawn(cfg.command, cfg.args ?? [], options);
}

/** Starts the server, performs the MCP handshake and lists its tools. Rejects if the handshake fails. */
export async function connectMcpServer(serverName: string, cfg: McpServerConfig, cwd: string): Promise<McpConnection> {
  const child = startServer(cfg, cwd);
  const pending = new Map<number, (response: RpcResponse) => void>();
  let nextId = 1;

  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const message = JSON.parse(line) as RpcResponse;
      if (message.id !== undefined) pending.get(message.id)?.(message);
    } catch {
      /* ignore non-JSON output */
    }
  });
  child.on("error", (error) => {
    for (const resolve of pending.values()) resolve({ error: { message: String(error) } });
  });
  child.on("exit", () => {
    for (const resolve of pending.values()) resolve({ error: { message: "MCP server exited" } });
  });

  const request = <T>(method: string, params: unknown, timeoutMs = REQUEST_TIMEOUT_MS) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), timeoutMs);
      pending.set(id, (response) => {
        clearTimeout(timer);
        pending.delete(id);
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result as T);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });

  try {
    await request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "cortex", version: "0.1.0" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const listed = await request<{ tools?: McpToolInfo[] }>("tools/list", {});

    const tools = (listed.tools ?? []).map((info) =>
      defineTool<Record<string, unknown>, { output: string }>({
        name: `mcp__${serverName}__${info.name}`,
        description: info.description ?? "",
        kind: "execute",
        parametersSchema: info.inputSchema ?? { type: "object", properties: {} },
        summarize: () => `${serverName}: ${info.name}`,
        failure: () => `MCP tool ${info.name} on ${serverName} failed`,
        async run(args) {
          const result = await request<McpCallResult>("tools/call", { name: info.name, arguments: args }, CALL_TIMEOUT_MS);
          const output = (result.content ?? []).map((part) => (part.type === "text" ? part.text ?? "" : `[${part.type}]`)).join("\n");
          if (result.isError) throw new Error(output || "MCP tool reported an error");
          return { output };
        },
      }),
    );

    return { tools, close: () => child.kill() };
  } catch (error) {
    child.kill();
    throw error;
  }
}
