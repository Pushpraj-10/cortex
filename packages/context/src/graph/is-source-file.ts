const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** True for the JavaScript/TypeScript files whose imports the dependency graph tracks. */
export function isSourceFile(relativePath: string): boolean {
  return SOURCE_FILE.test(relativePath);
}
