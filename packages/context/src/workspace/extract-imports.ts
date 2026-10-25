import { extractModuleSpecifiers } from "./extract-module-specifiers.js";

/**
 * Lists the relative module specifiers (`./a.js`, `../b`) a source file imports, in order
 * of first appearance, without duplicates. Package imports (`node:fs`, `@cortex/core`) are
 * left out — they point at dependencies, not at files this file sits next to. Pure; see
 * `extractModuleSpecifiers` for the scan's limits.
 */
export function extractImports(source: string): string[] {
  return extractModuleSpecifiers(source).filter((specifier) => specifier.startsWith("."));
}
