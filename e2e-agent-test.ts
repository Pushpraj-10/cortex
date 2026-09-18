/**
 * End-to-end integration test: @cortex/agent driving @cortex/llm (Ollama) against
 * @cortex/tools' real file-system tools, in a throwaway workspace.
 *
 * Every stage logs before/after so a crash or hang points at exactly which package
 * broke, without needing to bisect by hand.
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 npx tsx e2e-agent-test.ts
 *
 * Defaults: baseUrl http://localhost:11434, model llama3.1.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { createOllamaClient } from "./packages/llm/src/ollama/client.js";
import {
  registerTool,
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirectoryTool,
  createDirectoryTool,
  fileExistsTool,
  getFileInfoTool,
  deleteFileTool,
  moveFileTool,
  copyFileTool,
} from "./packages/tools/src/index.js";
import { createAgentSession, createToolsExecutor } from "./packages/agent/src/index.js";
import type { AgentEvent } from "./packages/agent/src/index.js";

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

function log(stage: string, detail?: unknown) {
  const ts = new Date().toISOString().split("T")[1]?.replace("Z", "");
  if (detail !== undefined) {
    console.log(`[${ts}] ${stage} ::`, typeof detail === "string" ? detail : JSON.stringify(detail));
  } else {
    console.log(`[${ts}] ${stage}`);
  }
}

async function main() {
  console.log("=".repeat(70));
  console.log("E2E: @cortex/agent + @cortex/llm (Ollama) + @cortex/tools");
  console.log(`Model: ${MODEL}  |  Base URL: ${BASE_URL}`);
  console.log("=".repeat(70) + "\n");

  // ---- Stage 1: Ollama reachability -------------------------------------------------
  log("STAGE 1: checking Ollama reachability");
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { models?: { name: string }[] };
    log("STAGE 1 OK: Ollama reachable, models available", body.models?.map((m) => m.name));
  } catch (error) {
    log("STAGE 1 FAILED: cannot reach Ollama", String(error));
    process.exit(1);
  }

  // ---- Stage 2: workspace setup -------------------------------------------------------
  log("STAGE 2: creating throwaway workspace");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-e2e-"));
  log("STAGE 2 OK: workspace created", workspaceRoot);

  // ---- Stage 3: register tools ---------------------------------------------------------
  log("STAGE 3: registering tools into @cortex/tools registry");
  try {
    for (const tool of [
      readFileTool,
      writeFileTool,
      editFileTool,
      listDirectoryTool,
      createDirectoryTool,
      fileExistsTool,
      getFileInfoTool,
      deleteFileTool,
      moveFileTool,
      copyFileTool,
    ]) {
      registerTool(tool);
    }
    log("STAGE 3 OK: 10 tools registered");
  } catch (error) {
    log("STAGE 3 FAILED", String(error));
    process.exit(1);
  }

  // ---- Stage 4: construct LLM client ----------------------------------------------------
  log("STAGE 4: constructing Ollama client");
  const llm = createOllamaClient({ model: MODEL, baseUrl: BASE_URL });
  log("STAGE 4 OK");

  // ---- Stage 5: construct executor + agent session --------------------------------------
  log("STAGE 5: constructing executor + agent session");
  const executor = createToolsExecutor(workspaceRoot);
  const session = createAgentSession({ llm, executor, workspaceRoot, maxIterations: 8 });
  log("STAGE 5 OK");

  // ---- Stage 6: drive a real task ---------------------------------------------------------
  const task =
    "Create a file named hello.txt containing exactly the text 'Hello, Cortex!' " +
    "using your write_file tool, then confirm it exists using file_exists.";
  log("STAGE 6: sending task to agent", task);

  let eventCount = 0;
  let toolCallCount = 0;
  let finalMessage: string | undefined;

  try {
    for await (const event of session.chat(task)) {
      eventCount += 1;
      logEvent(eventCount, event);
      if (event.type === "toolCall") toolCallCount += 1;
      if (event.type === "message") finalMessage = event.content;
    }
  } catch (error) {
    log("STAGE 6 FAILED: exception thrown from agent loop", error instanceof Error ? error.stack : String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }

  log("STAGE 6 OK: agent loop completed", { eventCount, toolCallCount, finalMessage });

  // ---- Stage 7: verify real filesystem effect --------------------------------------------
  log("STAGE 7: verifying hello.txt was actually written to disk");
  try {
    const filePath = path.join(workspaceRoot, "hello.txt");
    const content = await fs.readFile(filePath, "utf-8");
    log("STAGE 7 OK: file exists with content", content);
    if (!content.includes("Hello, Cortex!")) {
      log("STAGE 7 WARNING: content does not match expected text");
    }
  } catch (error) {
    log("STAGE 7 FAILED: file was not created on disk", String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }

  await cleanup(workspaceRoot);

  console.log("\n" + "=".repeat(70));
  console.log("✅ E2E TEST PASSED");
  console.log("=".repeat(70));
}

function logEvent(n: number, event: AgentEvent) {
  if (event.type === "toolCall") {
    log(`EVENT ${n} [toolCall]`, { toolName: event.toolName, args: event.args });
  } else if (event.type === "toolResult") {
    log(`EVENT ${n} [toolResult]`, { toolName: event.toolName, output: event.output });
  } else {
    log(`EVENT ${n} [message]`, event.content);
  }
}

async function cleanup(workspaceRoot: string) {
  log("CLEANUP: removing workspace", workspaceRoot);
  await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
}

main().catch((error) => {
  console.error("UNCAUGHT ERROR:", error);
  process.exit(1);
});
