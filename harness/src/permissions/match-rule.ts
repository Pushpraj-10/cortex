import { primaryArgument } from "./primary-argument";

/**
 * `Bash`            -> any Bash call
 * `Bash(npm test)`  -> exactly that command
 * `Bash(npm test:*)`-> command starting with "npm test"
 * `Read(src/*)`     -> argument starting with "src/"
 */
export function matchRule(rule: string, toolName: string, input: Record<string, unknown>): boolean {
  const m = /^([^()]+?)(?:\((.*)\))?$/.exec(rule.trim());
  if (!m || m[1] !== toolName) return false;
  const pattern = m[2];
  if (pattern === undefined) return true;
  const arg = primaryArgument(input);
  if (pattern.endsWith(":*")) return arg.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith("*")) return arg.startsWith(pattern.slice(0, -1));
  return arg === pattern;
}
