/**
 * End-to-end test of apps/cli's actual composition root (not a hand-built
 * client/executor/session like e2e-agent-test.ts) against a live Ollama model:
 * bootstrap() registers everything and builds the session, then a real task and a real
 * Escape-style cancellation are driven through it via the AbortSignal.
 *
 * Usage:
 *   OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 npm run test:e2e:cli
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { bootstrap } from "../apps/cli/src/runtime/bootstrap.js";
import { isLlmFailureMessage } from "../apps/cli/src/format/tool-calls.js";
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
  else if (event.type === "compacted") log(`EVENT ${n} [compacted]`, { before: event.before, after: event.after });
  else if (event.type === "messageDelta" || event.type === "context") return; // not logged: the text follows whole, and a size report is not an event of interest
  else log(`EVENT ${n} [message]`, event.content);
}

async function cleanup(workspaceRoot: string) {
  log("CLEANUP: removing workspace", workspaceRoot);
  await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
}

async function main() {
  console.log("=".repeat(70));
  console.log("E2E: apps/cli composition root (bootstrap) against live Ollama");
  console.log("=".repeat(70) + "\n");

  // ---- Stage 1: workspace + bootstrap ---------------------------------------------------
  // bypassPermissions: nobody is here to approve the write; CORTEX_PROVIDER pins Ollama even if a
  // cloud key happens to be exported in the shell.
  log("STAGE 1: creating throwaway workspace + bootstrap()");
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cortex-cli-e2e-"));
  const result = await bootstrap({
    cwd: workspaceRoot,
    interactive: false,
    mode: "bypassPermissions",
    env: { ...process.env, CORTEX_PROVIDER: "ollama" },
  });
  if (!result.ok) {
    log("STAGE 1 FAILED", result.error.message);
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  const { initialSession: session, providers } = result.value;
  log("STAGE 1 OK", { workspaceRoot, active: providers.active() });

  // ---- Stage 2: drive a real task through the real wiring -------------------------------
  const task =
    "Create a file named wired.txt containing exactly the text 'Wired!' using your " +
    "write_file tool, then confirm it exists using file_exists.";
  log("STAGE 2: sending task to the wired session", task);

  let eventCount = 0;
  let toolCallCount = 0;
  try {
    for await (const event of session.chat(task)) {
      eventCount += 1;
      logEvent(eventCount, event);
      if (event.type === "toolCall") toolCallCount += 1;
    }
  } catch (error) {
    log("STAGE 2 FAILED: exception thrown from agent loop", error instanceof Error ? error.stack : String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  log("STAGE 2 OK", { eventCount, toolCallCount });

  // ---- Stage 3: verify real filesystem effect --------------------------------------------
  log("STAGE 3: verifying wired.txt was actually written to disk");
  try {
    const content = await fs.readFile(path.join(workspaceRoot, "wired.txt"), "utf-8");
    log("STAGE 3 OK: file exists with content", content);
  } catch (error) {
    log("STAGE 3 FAILED: file was not created on disk", String(error));
    await cleanup(workspaceRoot);
    process.exit(1);
  }

  // ---- Stage 4: real AbortSignal cancellation through the wired session ------------------
  log("STAGE 4: aborting a request immediately after sending it (Escape-to-cancel path)");
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
  log("STAGE 4 result", { abortElapsedMs, cancelEventCount, sawFailureMessage });
  if (!sawFailureMessage) {
    log("STAGE 4 FAILED: aborting did not surface as an LLM-failure message");
    await cleanup(workspaceRoot);
    process.exit(1);
  }
  log("STAGE 4 OK: abort propagated through @cortex/providers's fetch call and surfaced correctly");

  await cleanup(workspaceRoot);

  console.log("\n" + "=".repeat(70));
  console.log("✅ E2E CLI WIRING TEST PASSED");
  console.log("=".repeat(70));
}

main().catch((error) => {
  console.error("UNCAUGHT ERROR:", error);
  process.exit(1);
});
