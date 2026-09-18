import type { Message } from "../types.js";

export const initialMessages: Message[] = [
  { id: "seed-user-1", role: "user", content: "Can you explain what resolveWorkspacePath does?" },
  {
    id: "seed-assistant-1",
    role: "assistant",
    content:
      "`resolveWorkspacePath` joins a **relative path** against a workspace root and rejects " +
      "anything that escapes it. It's used by every file-system tool for sandboxing.\n\n" +
      "Key points:\n" +
      "- Rejects absolute paths outright\n" +
      "- Rejects `..` traversal that would exit the root\n" +
      "- Returns an absolute, resolved path on success\n\n" +
      "```ts\n" +
      "export function resolveWorkspacePath(root: string, relativePath: string): string {\n" +
      "  // ...\n" +
      "}\n" +
      "```",
  },
];
