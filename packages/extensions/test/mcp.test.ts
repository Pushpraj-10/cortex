import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { connectMcpServer, type McpConnection } from "../src/mcp.js";

const fixture = fileURLToPath(new URL("./fixtures/mcp-server.mjs", import.meta.url));
const config = { command: process.execPath, args: [fixture] };

describe("connectMcpServer", () => {
  let connection: McpConnection | undefined;

  afterEach(() => {
    connection?.close();
    connection = undefined;
  });

  it("lists the server's tools with prefixed names, schemas and the execute kind", async () => {
    connection = await connectMcpServer("fixture", config, process.cwd());

    expect(connection.tools.map((t) => t.name)).toEqual(["mcp__fixture__echo", "mcp__fixture__fail"]);
    const echo = connection.tools[0]!;
    expect(echo.description).toBe("Echo text back");
    expect(echo.kind).toBe("execute");
    expect(echo.parametersSchema).toHaveProperty("properties.text");
    // a tool that declares no schema still gets a valid empty object schema
    expect(connection.tools[1]!.parametersSchema).toEqual({ type: "object", properties: {} });
  });

  it("calls a tool and returns its text output", async () => {
    connection = await connectMcpServer("fixture", config, process.cwd());
    const result = await connection.tools[0]!.handler({ text: "hello" }, { cwd: "." });
    expect(result).toEqual({ ok: true, value: { output: "hello" } });
  });

  it("turns a tool-reported error into a failed Result carrying the server's message", async () => {
    connection = await connectMcpServer("fixture", config, process.cwd());
    const result = await connection.tools[1]!.handler({}, { cwd: "." });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("boom");
  });

  it("summarizes a call by server and tool", async () => {
    connection = await connectMcpServer("fixture", config, process.cwd());
    expect(connection.tools[0]!.summarize!({})).toBe("fixture: echo");
  });

  it("rejects when the server cannot start", async () => {
    await expect(connectMcpServer("bad", { command: "definitely-not-a-real-command-xyz" }, process.cwd())).rejects.toThrow();
  });
});
