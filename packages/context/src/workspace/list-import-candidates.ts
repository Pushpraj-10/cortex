import path from "node:path";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json"];

// TypeScript ESM writes imports with the *output* extension (`./a.js` for `a.ts`).
const OUTPUT_TO_SOURCE_EXTENSION: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"],
};

/**
 * Lists, in preference order, the workspace paths a relative import specifier found in
 * `fromFile` could refer to: the `.js`-for-`.ts` convention, extensionless imports, and
 * directory `index` files. Pure — the caller decides how to check which one exists (a
 * `stat` for one-off lookups, a set lookup when it already has the whole file list).
 * A candidate may start with `..` when the specifier climbs out of the workspace.
 */
export function listImportCandidates(fromFile: string, specifier: string): string[] {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  const extension = path.posix.extname(base);
  const sourceExtensions = OUTPUT_TO_SOURCE_EXTENSION[extension];

  if (sourceExtensions) {
    const stem = base.slice(0, -extension.length);
    return [...sourceExtensions.map((ext) => stem + ext), base];
  }

  return [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
}
