const MAX_DETAIL_LENGTH = 2000;

/** Renders a tool's output for the expanded ToolCallBlock detail view. */
export function formatToolResultDetail(output: unknown): string {
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}\n… (truncated)` : text;
}
