import type { Message } from "../llm/types";

/** A plain user message (not a tool_result carrier) is a safe place to start a preserved tail. */
export function isTurnStart(m: Message): boolean {
  return m.role === "user" && (typeof m.content === "string" || m.content.every((b) => b.type !== "tool_result"));
}
