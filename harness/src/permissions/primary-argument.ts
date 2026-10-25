/** The argument a rule's pattern is matched against, per tool. */
export function primaryArgument(input: Record<string, unknown>): string {
  const v = input.command ?? input.file_path ?? input.path ?? input.pattern ?? "";
  return String(v);
}
