import type { AgentEvent } from "../agent/types";

export function printEvent(e: AgentEvent): void {
  if (e.type === "text") console.log(`\n${e.text}`);
  else if (e.type === "tool_call") console.log(`\n> ${e.name} ${JSON.stringify(e.input).slice(0, 160)}`);
  else if (e.type === "tool_result" && e.isError) console.log(`  ! ${e.content.slice(0, 200)}`);
  else if (e.type === "compacted") console.log(`\n[context compacted: ~${e.before} -> ~${e.after} tokens]`);
}
