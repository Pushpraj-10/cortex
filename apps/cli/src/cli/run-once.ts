import type { AgentSession } from "@cortex/agent";
import { errorSummary, firstSentence, isLlmFailureMessage, summarizeToolCall } from "../format/tool-calls.js";

/**
 * Non-interactive run (`cortex -p "..."`): the agent's answer goes to stdout and its tool calls to
 * stderr, so the answer can be piped. Returns the process exit code: 1 if the model request failed.
 */
export async function runOnce(session: AgentSession, prompt: string): Promise<number> {
  let exitCode = 0;

  for await (const event of session.chat(prompt)) {
    if (event.type === "toolCall") {
      console.error(`• ${summarizeToolCall(event.toolName, event.args)}`);
    } else if (event.type === "toolResult" && !event.ok) {
      const reason = errorSummary(event.output);
      console.error(`  ✗ ${event.refused ? firstSentence(reason) : reason}`);
    } else if (event.type === "message") {
      console.log(event.content);
      if (isLlmFailureMessage(event.content)) exitCode = 1;
    }
  }

  return exitCode;
}
