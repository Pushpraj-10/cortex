/** How tool calls and the agent's messages are described in the transcript. */
import { LLM_ERROR_PREFIX } from "@cortex/agent";
import { getTool, type ToolKind, type ToolPreview } from "@cortex/tools";

const MAX_DETAIL_LENGTH = 2000;

/** Where a tool call is in its life, as the transcript shows it. */
export type ToolStatus = "running" | "awaiting" | "success" | "error" | "declined" | "cancelled";

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

/**
 * How a finished call ended: `declined` when a decision stopped it (the user said no, policy denied it, a hook
 * blocked it), `error` when it failed on its own.
 */
export function statusOfResult(result: { ok: boolean; refused?: boolean }): "success" | "error" | "declined" {
  if (result.ok) return "success";
  return result.refused ? "declined" : "error";
}

/** What the tool says a call will do, found before it runs. Never throws: no preview is just no preview. */
export async function previewToolCall(toolName: string, args: unknown, cwd: string): Promise<ToolPreview | undefined> {
  try {
    return await getTool(toolName).preview?.(args as never, { cwd });
  } catch {
    return undefined;
  }
}

/** What the tool does to the world (`read`, `edit`, `execute`), or undefined for a tool that is not registered. */
export function toolKindOf(toolName: string): ToolKind | undefined {
  try {
    return getTool(toolName).kind;
  } catch {
    return undefined;
  }
}

/** "0.4s", "12.3s", "1m 05s". */
export function formatDuration(ms: number): string {
  if (ms < 59_950) return `${(Math.round(Math.max(0, ms) / 100) / 10).toFixed(1)}s`; // below the point that would round up to "60.0s"
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** The first line of a failed call's message, for showing under its header. */
export function errorSummary(output: unknown): string {
  const message =
    typeof output === "string"
      ? output
      : typeof output === "object" && output !== null && typeof (output as { error?: unknown }).error === "string"
        ? (output as { error: string }).error
        : "The call failed.";
  return message.split("\n")[0]!;
}

/** The first sentence of a message. The executor's refusals are written for the model ("... Do not retry it unchanged"); a person needs only the start. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = /[.!?](?=\s|$)/.exec(trimmed);
  return end ? trimmed.slice(0, end.index + 1) : trimmed;
}

/**
 * A command-style result (`{ output: "text", exitCode?, timedOut? }`) as the text a terminal would have shown, by its shape
 * and not by any tool's name. Undefined for any other shape.
 */
function commandOutputText(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null || typeof (output as { output?: unknown }).output !== "string") return undefined;
  const { output: text, exitCode, timedOut } = output as { output: string; exitCode?: unknown; timedOut?: unknown };
  const notes = [timedOut === true ? "timed out" : undefined, typeof exitCode === "number" && exitCode !== 0 ? `exit code ${exitCode}` : undefined].filter(Boolean);
  const body = text === "" && notes.length === 0 ? "(no output)" : text;
  return notes.length > 0 ? `${body}${body ? "\n" : ""}[${notes.join(", ")}]` : body;
}

/** Renders a tool's output for the expanded detail view, truncated so one big result cannot flood the screen. */
export function formatToolResultDetail(output: unknown): string {
  const text = typeof output === "string" ? output : (commandOutputText(output) ?? JSON.stringify(output, null, 2) ?? String(output));
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}\n… (truncated)` : text;
}

/** True for the one message the agent yields when the underlying model request fails; rendered as an error. */
export function isLlmFailureMessage(content: string): boolean {
  return content.startsWith(LLM_ERROR_PREFIX);
}
