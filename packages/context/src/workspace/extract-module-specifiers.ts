// `import … from "x"`, `export … from "x"`, side-effect `import "x"`, dynamic `import("x")`
// and `require("x")`. The `[^'"`;]*?` between the keyword and `from` keeps a match inside one
// statement and lets a multi-line import list through.
const MODULE_SPECIFIER = /(?:\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)(['"])([^'"\n]+)\1/g;

/**
 * Lists every module specifier a source file imports — relative (`./a.js`), package
 * (`@cortex/shared`) and built-in (`node:fs`) alike — in order of first appearance, without
 * duplicates. Pure; a regex scan rather than a parse, so an import inside a comment or string
 * can show up as a false positive.
 */
export function extractModuleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];

  for (const match of source.matchAll(MODULE_SPECIFIER)) {
    const specifier = match[2];
    if (specifier && !specifiers.includes(specifier)) specifiers.push(specifier);
  }

  return specifiers;
}
