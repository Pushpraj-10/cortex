function asString(value: unknown): string {
  return typeof value === "string" ? value : "?";
}

/** One-line collapsed summary for a tool call, e.g. `read_file`+`{path}` -> "Read {path}". */
export function summarizeToolCall(toolName: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case "read_file":
      return `Read ${asString(a.path)}`;
    case "write_file":
      return `Write ${asString(a.path)}`;
    case "edit_file":
      return `Edit ${asString(a.path)}`;
    case "delete_file":
      return `Delete ${asString(a.path)}`;
    case "list_directory":
      return `List ${asString(a.path)}`;
    case "create_directory":
      return `Create directory ${asString(a.path)}`;
    case "move_file":
      return `Move ${asString(a.from)} → ${asString(a.to)}`;
    case "copy_file":
      return `Copy ${asString(a.from)} → ${asString(a.to)}`;
    case "file_exists":
      return `Check ${asString(a.path)} exists`;
    case "get_file_info":
      return `Get info for ${asString(a.path)}`;
    default:
      return `Run ${toolName}`;
  }
}
