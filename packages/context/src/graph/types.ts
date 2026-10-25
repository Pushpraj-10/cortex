/**
 * What is remembered about one indexed file between turns. Only *raw* facts are stored, never
 * the files they resolve to: resolution depends on which other files exist right now, so it
 * is redone against the current file set each time the graph is built, and a file created or
 * deleted elsewhere can never leave a stale edge behind.
 */
export interface IndexedFile {
  mtimeMs: number;
  size: number;
  /** For a source file: every module specifier it imports (`./a.js`, `@cortex/shared`, `node:fs`). Empty for a `package.json`. */
  specifiers: string[];
  /** For a `package.json`: its `name`, which makes the package importable by that name from elsewhere in the workspace. */
  packageName?: string;
  /** For a `package.json`: its entry point (`main`, else `module`, else `types`), relative to the package directory. */
  packageMain?: string;
}

/** Workspace-relative, `/`-separated path → what's known about that source file or `package.json`. */
export type ImportIndex = Map<string, IndexedFile>;

/** Import edges between workspace files, in both directions. */
export interface ImportGraph {
  /** file → the workspace files it imports. */
  forward: Map<string, string[]>;
  /** file → the workspace files that import it. */
  reverse: Map<string, string[]>;
}

/** A file affected by a change to another, and how many import hops away it is (1 = imports it directly). */
export interface Dependent {
  file: string;
  depth: number;
}
