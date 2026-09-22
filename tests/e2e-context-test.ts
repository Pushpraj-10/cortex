/**
 * End-to-end test proving @cortex/context's injected context actually reaches the
 * model — not just that the code compiles. Registers workspaceOverviewProvider but
 * deliberately registers NO file-system tools, so the only way the model can answer
 * a question about the fixture project's package.json is from injected context.
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 npx tsx e2e-context-test.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { createOllamaClient } from "../packages/llm/src/ollama/client.js";
import { registerProvider as registerContextProvider, workspaceOverviewProvider } from "../packages/context/src/index.js";
import { createAgentSession } from "../packages/agent/src/index.js";
import type { AgentEvent, Executor } from "../packages/agent/src/index.js";

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";
const FIXTURE_NAME = "cortex-e2e-fixture-project";

function log(stage: string, detail?: unknown) {
  const ts = new Date().toISOString().split("T")[1]?.replace("Z", "");
  if (detail !== undefined) {
    console.log(`[${ts}] ${stage} ::`, typeof detail === "string" ? detail : JSON.stringify(detail));
  } else {
    console.log(`[${ts}] ${stage}`);
  }
}

function logEvent(n: number, event: AgentEvent) {
  if (event.type === "toolCall") log(`EVENT ${n} [toolCall]`, { toolName: event.toolName, args: event.args });
  else if (event.type === "toolResult") log(`EVENT ${n} [toolResult]`, { toolName: event.toolName, output: event.output });
  else log(`EVENT ${n} [message]`, event.content);
}

async function cleanup(workspaceRoot: string) {
  log("CLEANUP: removing workspace", workspaceRoot);
  await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
}

async function main() {
  console.log("=".repeat(70));
  console.log("E2E: @cortex/context — proving injected context reaches the model");
  console.log(`Model: ${MODEL}  |  Base URL: ${BASE_URL}`);
  console.log("=".repeat(70) + "\n");

  // ---- Stage 1: Ollama reachability -------------------------------------------------
  log("STAGE 1: checking Ollama reachability");
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log("STAGE 1 OK: Ollama reachable");
  } catch (error) {
    log("STAGE 1 FAILED: cannot reach Ollama", String(error));
    process.exit(1);
  }

  // ---- Stage 2: fixture workspace ------------------------------------------------------
  log("STAGE 2: creating throwaway workspace with a distinctive package.json");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-context-e2e-"));
  await fs.writeFile(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: FIXTURE_NAME, description: "A fixture project for the context e2e test." }, null, 2),
  );
  log("STAGE 2 OK", { workspaceRoot, fixtureName: FIXTURE_NAME });

  // ---- Stage 3: register the context provider, NO tools ---------------------------------
  log("STAGE 3: registering workspaceOverviewProvider (no file-system tools registered)");
  registerContextProvider(workspaceOverviewProvider);
  log("STAGE 3 OK");

  // ---- Stage 4: construct session ---------------------------------------------------------
  log("STAGE 4: constructing Ollama client + agent session");
  const llm = createOllamaClient({ model: MODEL, baseUrl: BASE_URL });
  const noToolsExecutor: Executor = {
    async execute(toolName) {
      throw new Error(`Unexpected tool call "${toolName}" — no tools were registered for this test`);
    },
  };
  const session = createAgentSession({ llm, executor: noToolsExecutor, workspaceRoot, maxIterations: 4 });
  log("STAGE 4 OK");

  // ---- Stage 5: drive the task -------------------------------------------------------------
  const task = "What is this project called, according to its package.json? Answer with just the name, do not use any tool.";
  log("STAGE 5: sending task", task);

  let eventCount = 0;
  let toolCallCount = 0;
  let finalMessage = "";

  try {
    for await (const event of session.chat(task)) {
      eventCount += 1;
      logEvent(eventCount, event);
      if (event.type === "toolCall") toolCallCount += 1;
      if (event.type === "message") finalMessage = event.content;
    }
  } catch (error) {
    log("STAGE 5 FAILED: exception thrown from agent loop", error instanceof Error ? error.stack : String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  log("STAGE 5 OK", { eventCount, toolCallCount, finalMessage });

  // ---- Stage 6: verify the answer came from injected context, not a tool call -----------
  log("STAGE 6: verifying the answer contains the fixture name and no tool was called");
  const mentionsFixtureName = finalMessage.includes(FIXTURE_NAME);
  if (!mentionsFixtureName || toolCallCount !== 0) {
    log("STAGE 6 FAILED", { mentionsFixtureName, toolCallCount, finalMessage });
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  log("STAGE 6 OK: context injection reached the model — no tool call was needed or made");

  await cleanup(workspaceRoot);

  console.log("\n" + "=".repeat(70));
  console.log("✅ E2E CONTEXT TEST PASSED");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error("UNCAUGHT ERROR:", error);
  process.exit(1);
});
