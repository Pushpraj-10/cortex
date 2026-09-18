/**
 * Non-interactive render-without-crash smoke check for the Ink TUI. Uses a FAKE
 * AgentSession (no live Ollama needed) so this can run in CI / a non-TTY sandbox.
 * Confirms App mounts, renders, and unmounts cleanly — not a substitute for actually
 * using it in a real terminal (see apps/cli/README.md's verification notes).
 *
 * Usage: npx tsx smoke-cli-render.ts
 */

import { Writable } from "node:stream";
import { render } from "ink";
import React from "react";
import { App } from "./apps/cli/src/App.js";
import type { AgentSession, AgentEvent } from "./packages/agent/src/index.js";

function log(message: string): void {
  console.log(`[smoke] ${message}`);
}

async function* fakeChat(userInput: string): AsyncGenerator<AgentEvent, void, void> {
  yield { type: "message", content: `Echo: ${userInput}` };
}

const fakeSession: AgentSession = { chat: fakeChat };

class CapturingStream extends Writable {
  chunks: string[] = [];
  columns = 80;
  rows = 24;

  override _write(chunk: Buffer | string, _encoding: string, callback: () => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  get output(): string {
    return this.chunks.join("");
  }
}

async function main() {
  log("rendering <App> with a fake AgentSession into a captured stream (non-TTY)...");

  const stdout = new CapturingStream();
  const { unmount } = render(
    React.createElement(App, { session: fakeSession, cwd: process.cwd(), model: "fake-model" }),
    { stdout: stdout as unknown as NodeJS.WriteStream, exitOnCtrlC: false, patchConsole: false },
  );

  await new Promise((resolve) => setTimeout(resolve, 200));
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 50));

  if (stdout.output.length === 0) {
    log("FAILED: no output rendered");
    process.exit(1);
  }

  log(`OK: rendered ${stdout.output.length} chars of output, no exception thrown`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[smoke] UNCAUGHT ERROR:", error);
  process.exit(1);
});
