import { isAbsolute, resolve } from "node:path";

export function resolvePath(cwd: string, p: unknown): string {
  if (typeof p !== "string" || p === "") throw new Error("A path argument is required");
  return isAbsolute(p) ? p : resolve(cwd, p);
}
