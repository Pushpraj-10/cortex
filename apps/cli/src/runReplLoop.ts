import type { AgentSession } from "@cortex/agent";
import { renderEvent } from "./render/index.js";
import type { Prompter } from "./internal/createPrompter.js";

/**
 * The interactive REPL: reads a line, treats `/exit` as a stop signal, and sends
 * everything else to `session.chat()`. No command table — chat is the only thing
 * this CLI does.
 */
export async function runReplLoop(session: AgentSession, prompter: Prompter): Promise<void> {
  const print = (lines: string[]): void => {
    for (const line of lines) console.log(line);
  };

  console.log("Cortex — type a task, or /exit");

  for (;;) {
    let line: string;
    try {
      line = await prompter.askLine("> ");
    } catch {
      // stdin closed (piped input ran out, or Ctrl+D in an interactive terminal) —
      // treat end-of-input as an implicit /exit rather than crashing with a raw
      // ERR_USE_AFTER_CLOSE stack trace.
      return;
    }

    const input = line.trim();
    if (!input) continue;
    if (input === "/exit") return;

    for await (const event of session.chat(input)) print(renderEvent(event));
  }
}
