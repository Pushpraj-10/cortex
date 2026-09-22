/**
 * End-to-end test of apps/cli's actual composition-root wiring (not a hand-built
 * client/executor/session like e2e-agent-test.ts) against a live Ollama model:
 * loadDotEnv -> registerFileSystemTools -> registerLlmProviders ->
 * createCliAgentSession, then drives a real task and a real Escape-style cancellation
 * through the AbortSignal threaded in this pass.
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 npx tsx e2e-cli-wiring-test.ts
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { registerFileSystemTools } from "../apps/cli/src/wiring/register-file-system-tools.js";
import { registerLlmProviders } from "../apps/cli/src/wiring/register-llm-providers.js";
import { createCliAgentSession } from "../apps/cli/src/wiring/create-cli-agent-session.js";
import { isLlmFailureMessage } from "../apps/cli/src/format/classify-agent-message.js";
import type { AgentEvent } from "../packages/agent/src/index.js";

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
  console.log("E2E: apps/cli composition-root wiring (registerFileSystemTools,");
  console.log("     registerLlmProviders, createCliAgentSession) against live Ollama");
  console.log("=".repeat(70) + "\n");

  // ---- Stage 1: wiring functions -------------------------------------------------------
  log("STAGE 1: registerFileSystemTools + registerLlmProviders");
  registerFileSystemTools();
  registerLlmProviders();
  log("STAGE 1 OK");

  // ---- Stage 2: workspace + session -----------------------------------------------------
  log("STAGE 2: creating throwaway workspace + createCliAgentSession");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-cli-e2e-"));
  const result = createCliAgentSession(workspaceRoot);
  if (!result.ok) {
    log("STAGE 2 FAILED", result.error.message);
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  const { session, model } = result.value;
  log("STAGE 2 OK", { workspaceRoot, model });

  // ---- Stage 3: drive a real task through the real wiring -------------------------------
  const task =
    "Create a file named wired.txt containing exactly the text 'Wired!' using your " +
    "write_file tool, then confirm it exists using file_exists.";
  log("STAGE 3: sending task to the wired session", task);

  let eventCount = 0;
  let toolCallCount = 0;
  try {
    for await (const event of session.chat(task)) {
      eventCount += 1;
      logEvent(eventCount, event);
      if (event.type === "toolCall") toolCallCount += 1;
    }
  } catch (error) {
    log("STAGE 3 FAILED: exception thrown from agent loop", error instanceof Error ? error.stack : String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  log("STAGE 3 OK", { eventCount, toolCallCount });

  // ---- Stage 4: verify real filesystem effect --------------------------------------------
  log("STAGE 4: verifying wired.txt was actually written to disk");
  try {
    const content = await fs.readFile(path.join(workspaceRoot, "wired.txt"), "utf-8");
    log("STAGE 4 OK: file exists with content", content);
  } catch (error) {
    log("STAGE 4 FAILED: file was not created on disk", String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }

  // ---- Stage 5: real AbortSignal cancellation through the wired session ------------------
  log("STAGE 5: aborting a request immediately after sending it (Escape-to-cancel path)");
  const controller = new AbortController();
  const abortStart = Date.now();
  let cancelEventCount = 0;
  let sawFailureMessage = false;

  const cancelPromise = (async () => {
    for await (const event of session.chat("Count to one million, slowly.", controller.signal)) {
      cancelEventCount += 1;
      logEvent(cancelEventCount, event);
      if (event.type === "message" && isLlmFailureMessage(event.content)) sawFailureMessage = true;
    }
  })();
  controller.abort();
  await cancelPromise;

  const abortElapsedMs = Date.now() - abortStart;
  log("STAGE 5 result", { abortElapsedMs, cancelEventCount, sawFailureMessage });
  if (!sawFailureMessage) {
    log("STAGE 5 FAILED: aborting did not surface as an LLM-failure message");
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  log("STAGE 5 OK: abort propagated through @cortex/llm's fetch call and surfaced correctly");

  await cleanup(workspaceRoot);

  console.log("\n" + "=".repeat(70));
  console.log("✅ E2E CLI WIRING TEST PASSED");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error("UNCAUGHT ERROR:", error);
  process.exit(1);
});
