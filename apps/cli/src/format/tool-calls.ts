/** How tool calls and the agent's messages are described in the transcript. */
import { LLM_ERROR_PREFIX } from "@cortex/agent";
import { getTool } from "@cortex/tools";

const MAX_DETAIL_LENGTH = 2000;

/**
 * One-line collapsed summary of a call, e.g. "Read src/a.ts". The tool itself knows how to describe
 * a call (`summarize`), so this works for any registered tool — built in, skill, or MCP — without
 * a list of tool names. Unregistered tools, tools without a summary and malformed args fall back to
 * "Run <name>".
 */
export function summarizeToolCall(toolName: string, args: unknown): string {
  try {
    const summary = getTool(toolName).summarize?.(args as never);
    if (summary) return summary;
  } catch {
    /* unregistered tool or args the summarizer could not read */
  }
  return `Run ${toolName}`;
}

/** Renders a tool's output for the expanded detail view, truncated so one big result cannot flood the screen. */
export function formatToolResultDetail(output: unknown): string {
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}\n… (truncated)` : text;
}

/** True for the one message the agent yields when the underlying model request fails; rendered as an error. */
export function isLlmFailureMessage(content: string): boolean {
  return content.startsWith(LLM_ERROR_PREFIX);
}
