import type { AgentSession } from "@cortex/agent";
import { errorSummary, firstSentence, isLlmFailureMessage, summarizeToolCall } from "../format/tool-calls.js";

/**
 * Non-interactive run (`cortex -p "..."`): the final answer goes to stdout and everything else to stderr (tool calls, and
 * what the model said on the way to them), so the answer can be piped. Text is not streamed here: a piped answer is only
 * known to be the answer once no tool call follows it. Returns the process exit code: 1 if the model request failed.
 */
export async function runOnce(session: AgentSession, prompt: string): Promise<number> {
  /** The latest message, held until something shows whether it was narration (a tool call follows) or the answer. */
  let held: string | undefined;

  for await (const event of session.chat(prompt)) {
    if (event.type === "message") {
      if (held !== undefined) console.error(held);
      held = event.content;
    } else if (event.type === "toolCall") {
      if (held !== undefined) console.error(held);
      held = undefined;
      console.error(`• ${summarizeToolCall(event.toolName, event.args)}`);
    } else if (event.type === "toolResult" && !event.ok) {
      const reason = errorSummary(event.output);
      console.error(`  ✗ ${event.refused ? firstSentence(reason) : reason}`);
    }
  }

  if (held !== undefined) console.log(held);
  return held !== undefined && isLlmFailureMessage(held) ? 1 : 0;
}
