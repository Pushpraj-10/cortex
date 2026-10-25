// A tiny MCP server for tests: speaks newline-delimited JSON-RPC 2.0 over stdio.
// Tools: `echo` returns its `text` argument; `fail` always reports an error.
import readline from "node:readline";

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return; // notification

  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } },
    });
  } else if (message.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Echo text back",
            inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
          },
          { name: "fail", description: "Always fails" },
        ],
      },
    });
  } else if (message.method === "tools/call") {
    const { name, arguments: args } = message.params;
    if (name === "echo") {
      send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: String(args.text) }] } });
    } else {
      send({ jsonrpc: "2.0", id: message.id, result: { isError: true, content: [{ type: "text", text: "boom" }] } });
    }
  }
});
