/**
 * The package a bare module specifier belongs to: `@cortex/shared/sub/path` is in
 * `@cortex/shared`, `lodash/fp` is in `lodash`. Returns `undefined` for relative specifiers
 * and `node:` built-ins, which don't name a package.
 */
export function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return undefined;

  const segments = specifier.split("/");
  if (specifier.startsWith("@")) return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : undefined;
  return segments[0];
}
