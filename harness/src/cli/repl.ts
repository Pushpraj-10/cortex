import type { Interface } from "node:readline/promises";
import { runAgent } from "../agent/run-agent";
import type { Message } from "../llm/types";
import { isPermissionMode } from "../permissions/is-permission-mode";
import type { PermissionMode } from "../permissions/types";
import type { Harness } from "./bootstrap";

/** Interactive loop. Slash commands: /mode <name>, /clear, /exit. */
export async function runRepl(harness: Harness, rl: Interface, startMode: PermissionMode): Promise<void> {
  let mode = startMode;
  let history: Message[] = [];
  console.log(`cortex-harness | mode: ${mode} | /mode <name>, /clear, /exit`);

  for (;;) {
    const line = (await rl.question("\n> ")).trim();
    if (!line) continue;
    if (line === "/exit") return;
    if (line === "/clear") {
      history = [];
      continue;
    }
    if (line.startsWith("/mode")) {
      const next = line.split(/\s+/)[1];
      if (isPermissionMode(next)) mode = next;
      console.log(`mode: ${mode}`);
      continue;
    }
    try {
      history = (await runAgent(history, line, harness.configure(mode))).messages;
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
    }
  }
}
