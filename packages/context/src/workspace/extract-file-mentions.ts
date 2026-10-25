const MAX_MENTIONS = 10;

/**
 * Extensions recognised as "this word names a file". An allowlist rather than "anything
 * with a dot", so prose like "e.g.", "v1.2" or "example.com" is never mistaken for a path.
 */
const FILE_EXTENSIONS = [
  "tsx", "ts", "mjs", "cjs", "jsx", "json", "js",
  "md", "mdx", "txt", "yaml", "yml", "toml", "env",
  "css", "scss", "html", "sql", "sh",
  "py", "go", "rs", "java", "kt", "rb", "php", "cs", "cpp", "c", "hpp", "h", "swift",
];

// A path is `/`- or `\`-separated segments ending in `name.ext`. The lookbehind stops a match
// from starting mid-word or mid-path (so URLs and absolute paths produce nothing); the
// lookahead stops `a.ts` matching inside `a.tsx`.
const FILE_MENTION = new RegExp(
  String.raw`(?<![\w@./\\:-])((?:[\w@.-]+[\\/])*[\w@-][\w@.-]*\.(?:${FILE_EXTENSIONS.join("|")}))(?![\w-])`,
  "g",
);

/**
 * Pulls file-looking references out of free text — `src/index.ts`, `` `package.json` ``,
 * "tool-loop.ts" — as workspace-relative, `/`-separated paths, in order of first
 * appearance, without duplicates. Pure: says nothing about whether the files exist.
 */
export function extractFileMentions(text: string): string[] {
  const mentions: string[] = [];

  for (const match of text.matchAll(FILE_MENTION)) {
    const mention = (match[1] ?? "").replace(/\\/g, "/").replace(/^(\.\/)+/, "");
    if (mention && !mentions.includes(mention)) mentions.push(mention);
    if (mentions.length >= MAX_MENTIONS) break;
  }

  return mentions;
}
