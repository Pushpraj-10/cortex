const HINTS: [RegExp, string][] = [
  [/ENOENT/, "The path does not exist. Use Glob to find the right path, and check paths are relative to the working directory."],
  [/EISDIR/, "That path is a directory. Use Glob to list the files inside it."],
  [/EACCES|EPERM/, "The OS denied access. Do not retry; tell the user."],
  [/not found in file/, "Re-read the file; its contents differ from what you expected."],
];

/** Error recovery contract: say what went wrong and what to do next, so the model does not blindly retry. */
export function formatToolError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const hint = HINTS.find(([re]) => re.test(message))?.[1];
  return hint ? `${message}\nHint: ${hint}` : message;
}
